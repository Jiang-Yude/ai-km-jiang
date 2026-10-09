import factory from "../../.cloudflare-generated/stats-admin.mjs";
import {serve} from "../../cloudflare/runtime.mjs";
export const onRequest = context => serve("stats-admin",factory,context);
