import { FOOD, ICONS, WHEN } from './schema';

const alt = (xs: readonly string[]) => xs.map((x) => `"\\"${x}\\""`).join(' | ');

/**
 * EBNF for WebLLM's grammar engine. Same shape as ROUTINE_JSON_SCHEMA, but with fixed
 * separators so a small model cannot wander off into endless whitespace.
 */
export const ROUTINE_EBNF = String.raw`root ::= "{\"title\": " str ", \"tasks\": [" task (", " task)* "]}"
task ::= "{\"said\": " str ", \"name\": " str ", \"dose\": " str ", \"when\": " timing ", \"food\": " food ", \"icon\": " icon ", \"note\": " str "}"
timing ::= "\"at_time\", \"hour\": " hour ", \"minute\": " minute | when
str ::= "\"" [^"\\\n\r]* "\""
hour ::= [0-9] | "1" [0-9] | "2" [0-3]
minute ::= [0-9] | [1-5] [0-9]
when ::= ${alt(WHEN)}
food ::= ${alt(FOOD)}
icon ::= ${alt(ICONS)}
`;
