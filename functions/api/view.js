import factory from "../../.cloudflare-generated/view.mjs";
import {serve} from "../../cloudflare/runtime.mjs";
export const onRequest = context => serve("view",factory,context);
