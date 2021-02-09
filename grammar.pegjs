{
  const { parserOptions } = options;
  const {
    allowGoto,
    allowIf,
    allowLoop,
    allowStop,
    allowWhile,
    ifStyle
  } = parserOptions;
}

Start
  = _ program:Program _ { return { program }; }

Program
  = stmt:Statement stmts:(_ ';' _ otherStmt:Statement { return otherStmt; })*
    { return [stmt, ...stmts]; }

Statement
  = stmt:StatementWithoutLabel { return stmt; }
  / label:Label _ stmt:StatementWithoutLabel  { return { label, ...stmt }; }

Label
  = &{return allowGoto;} id:Identifier _ ':' { return id; }

StatementWithoutLabel
  = stmt:StatementInner
    { return { location: location(), ...stmt }; }

StatementInner
  = assignment:Assignment { return assignment; }
  / &{return allowLoop;} loop:Loop { return loop; }
  / &{return allowWhile;} whileStmt:While { return whileStmt; }
  / &{return allowIf;} ifStmt:IfStatement { return ifStmt; }
  / &{return allowGoto;} gotoStmt:GotoStatement { return gotoStmt; }
  / &{return allowStop;} stopStmt:StopStatement { return stopStmt; }

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

While
  = 'WHILE' __ condition:BoolExpr __ 'DO' __ body:Program __ 'END'
    { return { type: 'while', condition, body }; }

IfStatement
  = &{return ifStyle !== 'goto'} stmt:RegularIfThenStatement
    { return stmt; }
  / &{return ifStyle === 'goto'} stmt:IfThenGotoStatement
    { return stmt; }

RegularIfThenStatement
  = 'IF' __ condition:BoolExpr __ 'THEN' __ thenPart:Program __ elsePart:('ELSE' __ p:Program __ { return p; })? 'END'
    { return { type: 'if', condition, thenPart, elsePart }; }

IfThenGotoStatement
  = 'IF' __ condition:BoolExpr __ 'THEN' __ &GotoStatement stmt:Statement
    { return { type: 'if', condition, thenPart: [stmt] }}

GotoStatement
  = 'GOTO' __ id:Identifier { return { type: 'goto', targetLabel: id }; }

StopStatement
  = ('STOP' / 'HALT') { return { type: 'stop' }; }

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
