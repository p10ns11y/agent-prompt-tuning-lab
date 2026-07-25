#!/usr/bin/env node
import { ensureRhaiHost, rhaiHostBinPath } from "./lib/rhai-runner.mjs";

const bin = await ensureRhaiHost({ rebuild: true });
console.log(JSON.stringify({ ok: true, bin: bin || rhaiHostBinPath() }, null, 2));
