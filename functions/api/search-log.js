import factory from "../../.cloudflare-generated/search-log.mjs";
import {serve} from "../../cloudflare/runtime.mjs";
export const onRequest = context => serve("search-log",factory,context);
