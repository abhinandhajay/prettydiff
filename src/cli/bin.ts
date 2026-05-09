#!/usr/bin/env node
import { main } from "./main.js";

main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
        process.stderr.write(`prettydiff: ${err?.message ?? err}\n`);
        process.exit(1);
    });
