#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <mach/mach.h>
#include <servers/bootstrap.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/mman.h>
#include <sys/un.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 3) return 2;
  int descriptor;
  int result;
  if (strcmp(argv[1], "detached") == 0) {
    pid_t leader = getpid();
    pid_t child = fork();
    if (child < 0) return 1;
    if (child > 0) return 0;
    if (setsid() < 0) return 1;
    for (int attempt = 0; getppid() == leader && attempt < 1000; attempt++) usleep(1000);
    if (getppid() == leader) return 1;
    descriptor = open("source.txt", O_WRONLY | O_APPEND);
    if (descriptor < 0 || write(descriptor, "staged", 6) != 6) return 1;
    close(descriptor);
    descriptor = open(argv[2], O_WRONLY | O_APPEND);
    if (descriptor >= 0) {
      close(descriptor);
      return 1;
    }
    if (errno != EPERM && errno != EACCES) return 1;
    puts("detached-write-denied");
    return 0;
  } else if (strcmp(argv[1], "mach") == 0) {
    mach_port_t service = MACH_PORT_NULL;
    kern_return_t status = bootstrap_look_up(bootstrap_port, argv[2], &service);
    if (status == KERN_SUCCESS) {
      mach_port_deallocate(mach_task_self(), service);
      puts("connected");
    } else if (status == BOOTSTRAP_NOT_PRIVILEGED || status == BOOTSTRAP_UNKNOWN_SERVICE) {
      puts("denied");
    } else {
      fprintf(stderr, "unexpected Mach failure: %d\n", status);
      return 1;
    }
    return 0;
  } else if (strcmp(argv[1], "shm-create") == 0) {
    descriptor = shm_open(argv[2], O_CREAT | O_EXCL | O_RDWR, 0600);
    if (descriptor < 0) return 1;
    result = ftruncate(descriptor, 1);
    close(descriptor);
    return result == 0 ? 0 : 1;
  } else if (strcmp(argv[1], "shm-remove") == 0) {
    return shm_unlink(argv[2]) == 0 ? 0 : 1;
  } else if (strcmp(argv[1], "shm") == 0) {
    descriptor = shm_open(argv[2], O_RDWR, 0);
    result = descriptor < 0 ? -1 : 0;
  } else if (strcmp(argv[1], "fd") == 0) {
    result = write(atoi(argv[2]), "changed", 7);
    if (result < 0 && errno == EBADF) puts("closed");
    else return 1;
    return 0;
  } else if (strcmp(argv[1], "tcp") == 0) {
    struct sockaddr_in address = {0};
    address.sin_family = AF_INET;
    address.sin_port = htons((unsigned short)atoi(argv[2]));
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    descriptor = socket(AF_INET, SOCK_STREAM, 0);
    result = descriptor < 0 ? -1 : connect(descriptor, (struct sockaddr *)&address, sizeof(address));
  } else if (strcmp(argv[1], "unix") == 0) {
    struct sockaddr_un address = {0};
    address.sun_family = AF_UNIX;
    if (strlen(argv[2]) >= sizeof(address.sun_path)) return 2;
    strcpy(address.sun_path, argv[2]);
    descriptor = socket(AF_UNIX, SOCK_STREAM, 0);
    result = descriptor < 0 ? -1 : connect(descriptor, (struct sockaddr *)&address, sizeof(address));
  } else {
    return 2;
  }
  int failure = errno;
  if (descriptor >= 0) close(descriptor);
  if (result == 0) puts("connected");
  else if (failure == EPERM || failure == EACCES) puts("denied");
  else {
    fprintf(stderr, "unexpected socket failure: %s\n", strerror(failure));
    return 1;
  }
  return 0;
}
