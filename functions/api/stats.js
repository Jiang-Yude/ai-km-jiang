import factory from "../../.cloudflare-generated/stats.mjs";
import {serve} from "../../cloudflare/runtime.mjs";
export const onRequest = context => serve("stats",factory,context);
