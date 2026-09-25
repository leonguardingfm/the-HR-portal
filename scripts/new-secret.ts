/**
 * A new sign-in secret (26 September 2026): 64 random bytes from the operating
 * system's secure generator, written as 86 characters. Printed once, here, for
 * the host's secret store — never written to a file.
 *
 *   npm run secret:new
 */

import { randomBytes } from "node:crypto";
import { secretProblem } from "../lib/auth/secret";

const secret = randomBytes(64).toString("base64url");
const problem = secretProblem(secret);
if (problem) throw new Error(`The generator produced something unusable (${problem}). Run it again.`);

console.log(`
A new sign-in secret. Put it in the host's secret store as AUTH_SECRET — not in a file, a chat or an email:

AUTH_SECRET=${secret}

Replacing a secret already in use? Move the old value to AUTH_SECRET_PREVIOUS first, deploy, then run
npm run secret:reseal. Remove AUTH_SECRET_PREVIOUS after twelve hours.
`);
