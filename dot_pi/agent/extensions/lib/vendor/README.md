# pi-btw

`pi-btw.ts` contains pi-btw 0.4.1 by Dan Bachelder, distributed under
`pi-btw.LICENSE`. Source: https://github.com/dbachelder/pi-btw and the
`pi-btw@0.4.1` npm package.

Session creation uses `withTelemetry` to load the New Relic extension in side
and summary sessions. Both session disposal paths await telemetry shutdown.
