#include <arpa/inet.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 3) return 2;
  int descriptor;
  int result;
  if (strcmp(argv[1], "tcp") == 0) {
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
