import { stripVTControlCharacters } from "node:util";

export function vitePressServerUrl(output) {
  return stripVTControlCharacters(output).match(new RegExp("http://(?:127[.]0[.]0[.]1|localhost):[0-9]+"))?.[0];
}
