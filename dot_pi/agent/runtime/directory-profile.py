"""Read native name-lookup metadata from held directory descriptors."""

import ctypes
import os
import stat
import struct
import sys


class AttrList(ctypes.Structure):
    _fields_ = [
        ("bitmapcount", ctypes.c_uint16),
        ("reserved", ctypes.c_uint16),
        ("commonattr", ctypes.c_uint32),
        ("volattr", ctypes.c_uint32),
        ("dirattr", ctypes.c_uint32),
        ("fileattr", ctypes.c_uint32),
        ("forkattr", ctypes.c_uint32),
    ]


ATTR_VOL_CAPABILITIES = 0x00020000
ATTR_VOL_UUID = 0x00040000
ATTR_VOL_FSTYPENAME = 0x00100000
ATTR_VOL_FSSUBTYPE = 0x00200000
ATTR_VOL_INFO = 0x80000000
VOL_CAP_FMT_CASE_SENSITIVE = 0x00000100
VOL_CAP_FMT_CASE_PRESERVING = 0x00000200


def decode_volume_profile(raw):
    if len(raw) < 64:
        raise ValueError("volume attributes are truncated")
    size, = struct.unpack_from("=I", raw)
    capabilities = struct.unpack_from("=8I", raw, 4)
    name_offset, name_length = struct.unpack_from("=iI", raw, 52)
    subtype, = struct.unpack_from("=I", raw, 60)
    name_start = 52 + name_offset
    if size < 64 or size > len(raw) or name_start < 64 or name_length < 2 or name_start + name_length > size:
        raise ValueError("volume attribute bounds are invalid")
    name = raw[name_start:name_start + name_length]
    if name[-1] != 0 or b"\0" in name[:-1]:
        raise ValueError("filesystem type name is invalid")
    case_bits = VOL_CAP_FMT_CASE_SENSITIVE | VOL_CAP_FMT_CASE_PRESERVING
    if capabilities[4] & case_bits != case_bits or not any(raw[36:52]):
        raise ValueError("volume name-lookup metadata is unavailable")
    return {
        "filesystem": name[:-1].decode("ascii"),
        "subtype": subtype,
        "volume": raw[36:52].hex(),
        "case_sensitive": bool(capabilities[0] & VOL_CAP_FMT_CASE_SENSITIVE),
        "case_preserving": bool(capabilities[0] & VOL_CAP_FMT_CASE_PRESERVING),
    }


def directory_profile(directory_fd):
    if sys.platform != "darwin":
        raise NotImplementedError("directory name profiles are not supported on this platform")
    info = os.fstat(directory_fd)
    if not stat.S_ISDIR(info.st_mode):
        raise ValueError("directory profile requires a directory descriptor")
    libc = ctypes.CDLL(None, use_errno=True)
    getattrs = libc.fgetattrlist
    getattrs.argtypes = [ctypes.c_int, ctypes.POINTER(AttrList), ctypes.c_void_p, ctypes.c_size_t, ctypes.c_ulong]
    getattrs.restype = ctypes.c_int
    attrs = AttrList(5, 0, 0, ATTR_VOL_INFO | ATTR_VOL_CAPABILITIES | ATTR_VOL_UUID | ATTR_VOL_FSTYPENAME | ATTR_VOL_FSSUBTYPE, 0, 0, 0)
    buffer = ctypes.create_string_buffer(8192)
    if getattrs(directory_fd, ctypes.byref(attrs), buffer, len(buffer), 0) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))
    return {"device": str(info.st_dev), **decode_volume_profile(buffer.raw)}
