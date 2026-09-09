import base64
import json
import os
import stat
import sys


def capture_tree(root):
    records = []

    def walk(directory_fd, prefix):
        with os.scandir(directory_fd) as entries:
            names = sorted(entry.name for entry in entries)
        for name in names:
            path = f"{prefix}/{name}" if prefix else name
            info = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if stat.S_ISDIR(info.st_mode):
                child_fd = os.open(
                    name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=directory_fd,
                )
                try:
                    info = os.fstat(child_fd)
                    records.append({"path": path, "type": "directory", "mode": stat.S_IMODE(info.st_mode)})
                    walk(child_fd, path)
                finally:
                    os.close(child_fd)
            elif stat.S_ISREG(info.st_mode):
                file_fd = os.open(
                    name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                    dir_fd=directory_fd,
                )
                try:
                    info = os.fstat(file_fd)
                    if not stat.S_ISREG(info.st_mode):
                        raise ValueError(f"capture entry is not a regular file: {path}")
                    with os.fdopen(file_fd, "rb", closefd=False) as source:
                        content = base64.b64encode(source.read()).decode("ascii")
                    records.append({"path": path, "type": "file", "mode": stat.S_IMODE(info.st_mode), "content": content})
                finally:
                    os.close(file_fd)
            else:
                raise ValueError(f"unsupported capture entry: {path}")

    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        walk(root_fd, "")
    finally:
        os.close(root_fd)
    return records


if __name__ == "__main__":
    json.dump(capture_tree(sys.argv[1]), sys.stdout)
