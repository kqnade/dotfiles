"""Check links in a private, immutable tree on the destination filesystem."""

import os
import stat
import sys


def inspect_tree_links(root):
    reports = []
    def collect(ancestors, path, target):
        reports.append({"path": path, "target": target, **inspect_link(ancestors, target)})
    _visit_links(root, collect)
    return sorted(reports, key=lambda report: report["path"])


def inspect_link(ancestors, target):
    trace = [["target", target]]
    def result(status):
        return {"status": status, "trace": trace}
    if target.startswith("/"):
        return result("escapes")
    stack = []
    try:
        for directory_fd in ancestors:
            stack.append(os.dup(directory_fd))
        pending = target.split("/")[::-1]
        followed = 1
        while pending:
            part = pending.pop()
            if part in ("", "."):
                continue
            if part == "..":
                trace.append(["parent"])
                if len(stack) == 1:
                    trace.append(["remaining", pending[::-1]])
                    return result("escapes")
                os.close(stack.pop())
                continue
            try:
                info = os.stat(part, dir_fd=stack[-1], follow_symlinks=False)
            except FileNotFoundError:
                trace.append(["missing", part])
                return result("dangling")
            if stat.S_ISLNK(info.st_mode):
                followed += 1
                if followed > 40:
                    raise ValueError("link chain exceeds validation limit")
                link_target = os.readlink(part, dir_fd=stack[-1])
                trace.append(["symlink", part, link_target])
                if link_target.startswith("/"):
                    trace.append(["remaining", pending[::-1]])
                    return result("escapes")
                pending.extend(link_target.split("/")[::-1])
            elif stat.S_ISDIR(info.st_mode):
                trace.append(["directory", part])
                stack.append(os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=stack[-1]))
            elif stat.S_ISREG(info.st_mode) and not pending:
                trace.append(["file", part])
                return result("contained")
            else:
                raise ValueError("link target traverses a non-directory or special file")
        return result("contained")
    finally:
        for directory_fd in reversed(stack):
            os.close(directory_fd)


def validate_link(ancestors, target):
    if inspect_link(ancestors, target)["status"] == "escapes":
        raise ValueError("link target escapes validation root")


def _visit_links(root, visitor):
    def walk(ancestors, path):
        directory_fd = ancestors[-1]
        with os.scandir(directory_fd) as entries:
            for entry in entries:
                info = os.stat(entry.name, dir_fd=directory_fd, follow_symlinks=False)
                if stat.S_ISLNK(info.st_mode):
                    visitor(ancestors, "/".join([*path, entry.name]), os.readlink(entry.name, dir_fd=directory_fd))
                elif stat.S_ISDIR(info.st_mode):
                    child_fd = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory_fd)
                    ancestors.append(child_fd)
                    try:
                        walk(ancestors, [*path, entry.name])
                    finally:
                        ancestors.pop()
                        os.close(child_fd)
                elif not stat.S_ISREG(info.st_mode):
                    raise ValueError("validation tree contains a special file")

    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        walk([root_fd], [])
    finally:
        os.close(root_fd)


def validate_tree(root):
    _visit_links(root, lambda ancestors, path, target: validate_link(ancestors, target))


if __name__ == "__main__":
    validate_tree(sys.argv[1])
