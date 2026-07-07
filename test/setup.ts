// Must load after happydom.ts: @testing-library/dom binds `screen` to the global
// document at import time.
import { afterEach, expect } from "bun:test";

import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

afterEach(cleanup);
