import factory from "../../.cloudflare-generated/mika-chat-log.mjs";
import {serve} from "../../cloudflare/runtime.mjs";
export const onRequest = context => serve("mika-chat-log",factory,context);
