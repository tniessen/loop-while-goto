'use strict';

function downloadGrammar() {
  return fetch(`/grammar.pegjs?t=${Date.now()}`).then((response) => response.text());
}

function clearLog() {
  document.getElementById('log').textContent = '';
}

function displayLog(message) {
  document.getElementById('log').textContent += `${message}\n`;
}

function compile(program) {
  const code = [];
  const sourcePositions = new Map();

  function compileExpression(expr) {
    if (expr.type === 'constant') {
      code.push(['ldc', expr.value]);
    } else if (expr.type === 'id') {
      code.push(['push', expr.id]);
    } else if (expr.type === 'arith') {
      compileExpression(expr.left);
      compileExpression(expr.right);
      const opcode = {
        '+': 'add',
        '-': 'sub',
        '*': 'mul',
        'DIV': 'div',
        'MOD': 'rem'
      }[expr.op];
      if (typeof opcode !== 'string') {
        throw new Error(`Invalid arithmetic operator: '${expr.op}'`);
      }
      code.push([opcode]);
    }
  }

  function compileBoolExpr(expr) {
    compileExpression(expr.left);
    compileExpression(expr.right);
    const opcode = {
      '=': 'eq',
      '<': 'lt',
      '>': 'gt',
      '<=': 'leq',
      '>=': 'geq',
      '<>': 'ne',
      '!=': 'ne'
    }[expr.op];
    if (typeof opcode !== 'string') {
      throw new Error(`Invalid comparison operator: '${expr.op}'`);
    }
    code.push([opcode]);
  }

  function compileStatement(statement) {
    sourcePositions.set(statement.location.start.offset, code.length);
    if (statement.type === 'assignment') {
      compileExpression(statement.value);
      code.push(['pop', statement.id]);
    } else if (statement.type === 'loop') {
      compileExpression(statement.count);
      const loopEntryIndex = code.length;
      code.push(['dup']);
      const skipLoopBody = ['jz'];
      code.push(skipLoopBody);
      compileStatements(statement.body);
      code.push(['ldc', 1]);
      code.push(['sub']);
      code.push(['jmp', loopEntryIndex]);
      skipLoopBody.push(code.length);
      code.push(['pop']);
    } else if (statement.type === 'if') {
      const { condition, thenPart, elsePart } = statement;
      compileBoolExpr(condition);
      const skipThenPart = ['jz'];
      code.push(skipThenPart);
      compileStatements(thenPart);
      if (elsePart) {
        const skipElsePart = ['jmp'];
        code.push(skipElsePart);
        // If the condition was not true, jump here.
        skipThenPart.push(code.length);
        compileStatements(elsePart);
        // Patch the "then" branch to jump to the next instruction after "else".
        skipElsePart.push(code.length);
      } else {
        // No "else" branch. Patch the condition to jump beyond the "then"
        // branch if false.
        skipThenPart.push(code.length);
      }
    } else {
      throw new Error(`Invalid statement type: '${statement.type}'`);
    }
    sourcePositions.set(statement.location.end.offset, code.length);
  }

  function compileStatements(statements) {
    for (const statement of statements) {
      compileStatement(statement);
    }
  }

  compileStatements(program);
  console.log(code.map((insn, i) => `${i.toString().padStart(4, '0')} ${insn.join(' ')}`).join('\n'));
  return { code, sourcePositions };
}

function initVirtualMachine(code) {
  // Extract variable names from the code.
  const variableNameSet = new Set();
  for (const [opcode, operand] of code) {
    if (opcode === 'push' || (opcode === 'pop' && operand != null)) {
        variableNameSet.add(operand);
    }
  }

  // Sort the names.
  const variableNames = [...variableNameSet].sort((a, b) => {
    return parseInt(a.substring(1), 10) - parseInt(b.substring(1), 10);
  });

  const _vars = {};
  for (const name of variableNames)
    _vars[name] = 0;
  let _programCounter = 0;
  const _stack = [];
  const cpu = {
    get pc() {
      return _programCounter;
    },
    set pc(value) {
      if (!Number.isSafeInteger(value) || value < 0 || value > code.length)
        throw new Error();
      _programCounter = value;
    },
    get(name) {
      return _vars[name];
    },
    set(name, value) {
      _vars[name] = value;
    },
    push(value) {
      _stack.push(value);
    },
    pop() {
      if (_stack.length === 0)
        throw new Error();
      return _stack.pop();
    },
    peek() {
      if (_stack.length === 0)
        throw new Error();
      return _stack[_stack.length - 1];
    },
    get reachedEndOfCode() {
      return _programCounter === code.length;
    }
  };

  const pop2 = (fn) => ((last) => fn(cpu.pop(), last))(cpu.pop());

  const impl = {
    push: (name) => cpu.push(cpu.get(name)),
    pop: (name) => ((v) => name != null && cpu.set(name, v))(cpu.pop()),
    dup: () => cpu.push(cpu.peek()),
    ldc: (c) => cpu.push(c),
    jmp: (o) => cpu.pc = o,
    jz: (o) => cpu.pop() === 0 && (cpu.pc = o),
    eq: () => cpu.push(pop2((a, b) => +(a === b))),
    lt: () => cpu.push(pop2((a, b) => +(a < b))),
    gt: () => cpu.push(pop2((a, b) => +(a > b))),
    leq: () => cpu.push(pop2((a, b) => +(a <= b))),
    geq: () => cpu.push(pop2((a, b) => +(a >= b))),
    ne: () => cpu.push(pop2((a, b) => +(a !== b))),
    sub: () => cpu.push(Math.max(0, pop2((a, b) => a - b))),
    add: () => cpu.push(pop2((a, b) => a + b)),
    mul: () => cpu.push(pop2((a, b) => a * b)),
    div: () => cpu.push(Math.floor(pop2((a, b) => a / b))),
    rem: () => cpu.push(pop2((a, b) => a % b))
  };

  cpu.step = () => {
    if (cpu.reachedEndOfCode) {
      return;
    }

    const [opcode, operand] = code[cpu.pc++];
    console.log('Step:', cpu.pc - 1, opcode, operand);
    const oldStack = [..._stack];
    const fn = impl[opcode];
    if (fn) {
      fn(operand);
    } else {
      throw new Error(`Invalid opcode: ${opcode}`);
    }
    console.log('->', oldStack, _stack);
  }

  return {
    variableNames,
    cpu
  };
}

const codeInput = document.querySelector('#program textarea');
const codeDisplay = document.querySelector('#program pre');
const varsInput = document.querySelector('#variables textarea');
const varsTable = document.querySelector('#variables table');
const varsTableBody = document.querySelector('#variables tbody');
const startButton = document.getElementById('start-button');

function createSpan(text, config) {
  const { start, end, children, call } = config;

  const span = document.createElement('span');
  let textOffset = start;
  if (Array.isArray(children)) {
    for (let childIndex = 0; childIndex < children.length; childIndex++) {
      const childConfig = children[childIndex];
      if (childConfig.start > textOffset) {
        span.appendChild(document.createTextNode(text.substring(textOffset, childConfig.start)));
      }
      span.appendChild(createSpan(text, childConfig));
      textOffset = childConfig.end;
    }
  }

  if (textOffset < end) {
    span.appendChild(document.createTextNode(text.substring(textOffset, end)));
  }

  if (call) {
    call(span);
  }

  return span;
}

startButton.addEventListener('click', () => {
  clearLog();
  codeInput.classList.add('hidden');
  varsInput.classList.add('hidden');
  startButton.classList.add('hidden');

  codeDisplay.classList.remove('hidden');
  varsTable.classList.remove('hidden');
  codeDisplay.innerHTML = '';
  varsTableBody.innerHTML = '';

  const source = codeInput.value;
  codeDisplay.textContent = source;

  displayLog('Loading grammar definition...');
  downloadGrammar().then((grammar) => {
    displayLog('Compiling grammar...');
    const parser = peg.generate(grammar);
    displayLog('Parsing program...');
    try {
      const { program } = parser.parse(source);
      console.log(program);

      function createSpanForStatement(statement) {
        const span = {
          start: statement.location.start.offset,
          end: statement.location.end.offset
        };

        if (statement.type === 'assignment') {
          span.call = (e) => e.classList.add('text-yellow-600');
        } else if (statement.type === 'loop') {
          span.call = (e) => e.classList.add('text-green-600');
          span.children = statement.body.map(createSpanForStatement);
        } else if (statement.type === 'if') {
          span.call = (e) => e.classList.add('text-red-600');
          span.children = statement.thenPart.map(createSpanForStatement);
          if (statement.elsePart) {
            span.children.push(...statement.elsePart.map(createSpanForStatement));
          }
        }

        return span;
      }

      const rootSpan = {
        start: 0,
        end: source.length,
        children: program.map(createSpanForStatement)
      };
      const span = createSpan(source, rootSpan);
      codeDisplay.innerHTML = '';
      codeDisplay.appendChild(span);

      displayLog('Compiling program...');
      const { code, sourcePositions } = compile(program);
      console.log(code);
      console.log(sourcePositions);

      const instructionToSourcePositionMap = new Map(
        Array.from(sourcePositions, a => a.reverse())
      );
      function isSourcePosition(codePosition) {
        return instructionToSourcePositionMap.has(codePosition);
      }

      displayLog('Starting program...');
      const vm = initVirtualMachine(code);
      const varValueCells = new Map();
      for (const name of vm.variableNames) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.classList.add('text-right', 'border-r-2', 'pr-4');
        nameCell.textContent = name;
        row.appendChild(nameCell);
        const valueCell = document.createElement('td');
        valueCell.classList.add('text-left', 'pl-4');
        valueCell.textContent = vm.cpu.get(name);
        row.appendChild(valueCell);
        varsTableBody.appendChild(row);
        varValueCells.set(name, valueCell);
      }
      let stepInterval = setInterval(() => {
        try {
          do {
            vm.cpu.step();
          } while (!vm.cpu.reachedEndOfCode && !isSourcePosition(vm.cpu.pc));
          codeDisplay.innerHTML = '';
          const sourcePos = instructionToSourcePositionMap.get(vm.cpu.pc);
          const before = source.substring(0, sourcePos);
          const after = source.substring(sourcePos);
          codeDisplay.textContent = before;
          codeDisplay.textContent += '👁';
          codeDisplay.textContent += after;

          for (const name of vm.variableNames) {
            varValueCells.get(name).textContent = vm.cpu.get(name);
          }
        } catch (err) {
          console.error(err);
          clearInterval(stepInterval);
        }
      }, 100);
    } catch (err) {
      console.error(err);
      displayLog(String(err));
      if (err.location) {
        displayLog(`Near line ${err.location.start.line}`);
      }
    }
  });
});
