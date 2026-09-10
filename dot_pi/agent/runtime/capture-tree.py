import base64
import json
import os
import stat
import sys


def capture_tree(root, max_bytes=64 * 1024 * 1024, max_entries=100_000, max_metadata_bytes=8 * 1024 * 1024, *, topology_only=False):
    if not isinstance(max_bytes, int) or max_bytes < 0:
        raise ValueError("capture byte limit must be a nonnegative integer")
    if not isinstance(max_entries, int) or max_entries < 0:
        raise ValueError("capture entry limit must be a nonnegative integer")
    if not isinstance(max_metadata_bytes, int) or max_metadata_bytes < 0:
        raise ValueError("capture metadata limit must be a nonnegative integer")
    records = []
    remaining = max_bytes
    remaining_entries = max_entries
    remaining_metadata = max_metadata_bytes

    def append_record(record):
        nonlocal remaining_metadata
        metadata = {key: value for key, value in record.items() if key != "content"}
        remaining_metadata -= len(json.dumps(metadata).encode("ascii"))
        if remaining_metadata < 0:
            raise ValueError("capture metadata limit exceeded")
        records.append(record)

    def walk(directory_fd, prefix):
        nonlocal remaining, remaining_entries
        names = []
        with os.scandir(directory_fd) as entries:
            for entry in entries:
                if remaining_entries == 0:
                    raise ValueError("capture entry limit exceeded")
                remaining_entries -= 1
                names.append(entry.name)
        for name in sorted(names):
            path = f"{prefix}/{name}" if prefix else name
            info = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if stat.S_ISDIR(info.st_mode):
                child_fd = os.open(
                    name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=directory_fd,
                )
                try:
                    info = os.fstat(child_fd)
                    append_record({"path": path, "type": "directory", "mode": stat.S_IMODE(info.st_mode)})
                    walk(child_fd, path)
                finally:
                    os.close(child_fd)
            elif stat.S_ISREG(info.st_mode):
                if topology_only:
                    append_record({"path": path, "type": "file", "mode": stat.S_IMODE(info.st_mode)})
                    continue
                file_fd = os.open(
                    name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                    dir_fd=directory_fd,
                )
                try:
                    info = os.fstat(file_fd)
                    if not stat.S_ISREG(info.st_mode):
                        raise ValueError(f"capture entry is not a regular file: {path}")
                    with os.fdopen(file_fd, "rb", closefd=False) as source:
                        data = source.read(remaining + 1)
                    if len(data) > remaining:
                        raise ValueError("capture byte limit exceeded")
                    remaining -= len(data)
                    content = base64.b64encode(data).decode("ascii")
                    append_record({"path": path, "type": "file", "mode": stat.S_IMODE(info.st_mode), "content": content})
                finally:
                    os.close(file_fd)
            elif stat.S_ISLNK(info.st_mode):
                target = os.readlink(name, dir_fd=directory_fd)
                append_record({"path": path, "type": "symlink", "target": target})
            else:
                raise ValueError(f"unsupported capture entry: {path}")

    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        walk(root_fd, "")
    finally:
        os.close(root_fd)
    return records


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--topology", action="store_true", dest="topology_only")
    parser.add_argument("root")
    parser.add_argument("max_bytes", type=int, nargs="?", default=64 * 1024 * 1024)
    parser.add_argument("max_entries", type=int, nargs="?", default=100_000)
    parser.add_argument("max_metadata_bytes", type=int, nargs="?", default=8 * 1024 * 1024)
    json.dump(capture_tree(**vars(parser.parse_args())), sys.stdout)
