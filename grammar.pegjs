Start
  = _ program:Program _ { return { program }; }

Program
  = stmt:Statement stmts:(';' _ otherStmt:Statement { return otherStmt; })*
    { return [stmt, ...stmts]; }

Statement
  = stmt:StatementInner
    { return { location: location(), ...stmt }; }

StatementInner
  = assignment:Assignment { return assignment; }
  / loop:Loop { return loop; }
  / ifStmt:IfStatement { return ifStmt; }

Assignment
  = id:Identifier _ ':=' _ value:IntExpression
    { return { type: 'assignment', id, value }; }

IntExpression
  = arith:Arithmetic { return arith; }
  / atomic:Atomic { return atomic; }

Arithmetic
  = left:Atomic _ op:Operator _ right:Atomic
    { return { type: 'arith', left, op, right }; }

Operator
  = '+' / '-' / '*' / 'DIV' / 'MOD'

Loop
  = 'LOOP' __ count:Atomic __ 'DO' __ body:Program __ 'END'
    { return { type: 'loop', count, body }; }

IfStatement
  = 'IF' __ condition:BoolExpr __ 'THEN' __ thenPart:Program __ elsePart:('ELSE' __ p:Program __ { return p; })? 'END'
    { return { type: 'if', condition, thenPart, elsePart }; }

BoolExpr
  = left:Atomic _ op:BoolOp _ right:Atomic { return { left, op, right }; }

BoolOp
  = '=' / '!=' / '<>' / '<=' / '<' / '>=' / '>'

Atomic
  = value:Integer { return { type: 'constant', value }; }
  / id:Identifier { return { type: 'id', id }; }

Identifier
  = [a-zA-Z][a-zA-Z0-9]* { return text(); }

Integer "integer"
  = [0-9]+ { return parseInt(text(), 10); }

_ "whitespace"
  = ([ \t\n\r] / Comment)*
  
__
  = ([ \t\n\r] / Comment)+

Comment
  = '//' [^\n]* '\n'
