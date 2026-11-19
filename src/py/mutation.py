"""Process lock for Python writers sharing a workspace."""

from contextlib import contextmanager
import os


@contextmanager
def workspace_mutation(directory):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / ".python.lock").open("a+b") as lock:
        if os.name == "nt":
            import msvcrt

            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl

            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        yield
