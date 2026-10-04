import factory from "../../.cloudflare-generated/mika-chat.mjs";
import {serve} from "../../cloudflare/runtime.mjs";
export const onRequest = context => serve("mika-chat",factory,context);
