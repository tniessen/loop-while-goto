# loop-while-goto

This is a web-based interpreter for the LOOP, WHILE, and GOTO programming
languages. The parser and compiler understand each language by itself, but also
arbitrary combinations of language elements of all three languages.

The parser can be configured to allow any subset of the three languages.

## LOOP

[LOOP](https://en.wikipedia.org/wiki/LOOP_(programming_language)) was
originally specified in
[*The complexity of loop programs* (1967)](https://doi.org/10.1145/800196.806014)
by Albert R. Meyer and Dennis M. Richie.

Unlike most modern programming languages (and unlike WHILE and GOTO), this
programming language is not Turing-complete. The set of functions that can be
computed by LOOP programs is the set of
[primitive recursive functions](https://en.wikipedia.org/wiki/Primitive_recursive_function),
which is a subset of the set of
[Turing-computable functions](https://en.wikipedia.org/wiki/General_recursive_function).

## WHILE

[WHILE](https://en.wikipedia.org/wiki/While_loop#While_programming_language) is
very similar to LOOP but allows `WHILE` statements in addition to the basic
`LOOP` construct. This programming language is Turing-complete.

## GOTO

GOTO ([German Wikipedia page](https://de.wikipedia.org/wiki/GOTO-Programm))
does not require `LOOP` or `WHILE` statements, but is just as expressive as
WHILE.

Syntactically, GOTO is mostly compatible with LOOP and WHILE. However, the
synax of `IF` statements is slightly different. The interpreter allows
using either syntax in all three languages.
