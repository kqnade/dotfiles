unalias dsh 2>/dev/null
dsh() {
	"$HOME/.local/bin/dsh-profile" "$@"
}

dsh-personal() {
	dsh personal "$@"
}

dsh-work() {
	dsh work "$@"
}
