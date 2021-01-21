'use strict';

const editView = document.getElementById('edit-view');
const executionView = document.getElementById('execution-view');

const sourceInput = document.querySelector('#source-input');
const sourceDisplay = document.querySelector('#source-display');
const varsInput = document.querySelector('#variable-input');
const varsDisplay = document.querySelector('#variable-display');

const executionStatusField = document.getElementById('execution-status-field');

const stepButton = document.getElementById('step-button');
const resumeButton = document.getElementById('resume-button');
const pauseButton = document.getElementById('pause-button');
const resetButton = document.getElementById('reset-button');

document.getElementById('switch-to-execution-button').addEventListener('click', () => {
  switchToExecutionView();
});

document.getElementById('back-to-edit-button').addEventListener('click', () => {
  switchToEditView();
});

let currentExecutionContext;

stepButton.addEventListener('click', () => {
  if (currentExecutionContext !== undefined) {
    currentExecutionContext.step();
  }
});

resumeButton.addEventListener('click', () => {
  if (currentExecutionContext !== undefined) {
    currentExecutionContext.resume();
  }
});

pauseButton.addEventListener('click', () => {
  if (currentExecutionContext !== undefined) {
    currentExecutionContext.pause();
  }
});

resetButton.addEventListener('click', () => {
  if (currentExecutionContext !== undefined) {
    currentExecutionContext.reset();
  }
});

function switchToEditView() {
  editView.classList.remove('hidden');
  executionView.classList.add('hidden');

  if (currentExecutionContext !== undefined) {
    currentExecutionContext.destroy();
    currentExecutionContext = undefined;
  }
}

function switchToExecutionView() {
  editView.classList.add('hidden');
  executionView.classList.remove('hidden');

  prepareExecution();
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
    } else if (statement.type === 'while') {
      const loopEntryIndex = code.length;
      compileBoolExpr(statement.condition);
      const skipLoopBody = ['jz'];
      code.push(skipLoopBody);
      compileStatements(statement.body);
      code.push(['jmp', loopEntryIndex]);
      skipLoopBody.push(code.length);
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

function downloadGrammar() {
  return fetch(`/grammar.pegjs?t=${Date.now()}`)
         .then((response) => response.text());
}

function loadAndCompileGrammar() {
  displayLog('Loading grammar definition...');
  return downloadGrammar().then((grammar) => {
    displayLog('Compiling grammar...');
    return peg.generate(grammar);
  });
}

function parseProgram(source) {
  return loadAndCompileGrammar().then((parser) => {
    displayLog('Parsing program...');
    const { program } = parser.parse(source);
    return program;
  });
}

function parseAndCompileProgram(source) {
  return parseProgram(source).then((program) => {
    displayLog('Compiling program...');
    const { code, sourcePositions } = compile(program);
    return { source, code, sourcePositions };
  });
}

function displayState({ pc, vars, reachedEndOfCode, isRunning, totalSteps }) {
  setButtonEnabled(stepButton, !isRunning && !reachedEndOfCode);
  setButtonEnabled(resumeButton, !isRunning && !reachedEndOfCode);
  setButtonEnabled(pauseButton, isRunning);
  setButtonEnabled(resetButton, true);

  if (isRunning) {
    executionStatusField.textContent = 'The program is still running.';
  } else if (reachedEndOfCode) {
    executionStatusField.textContent = `The program reached its end after ${totalSteps} steps.`;
  } else {
    executionStatusField.textContent = 'The program is paused.';
  }

  const varNames = Object.keys(vars);
  if (varsDisplay.children.length !== varNames.length) {
    varsDisplay.innerHTML = '';

    for (let i = 0; i < varNames.length; i++) {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.classList.add('text-right', 'border-r-2', 'pr-4', 'var-name');
      row.appendChild(nameCell);
      const valueCell = document.createElement('td');
      valueCell.classList.add('text-left', 'pl-4', 'var-value');
      row.appendChild(valueCell);
      varsDisplay.appendChild(row);
    }
  }

  for (let i = 0; i < varNames.length; i++) {
    const row = varsDisplay.children[i];
    row.querySelector('.var-name').textContent = varNames[i];
    row.querySelector('.var-value').textContent = vars[varNames[i]];
  }
}

function createExecutionContext({ source, code, sourcePositions }) {
  const worker = new Worker(`worker.js?t=${Date.now()}`);

  worker.addEventListener('message', (event) => {
    displayState(event.data);
  });

  function init() {
    worker.postMessage({ type: 'init', code });
  }

  init();

  return {
    reset() {
      init();
    },
    resume() {
      worker.postMessage({ type: 'resume' });
    },
    pause() {
      worker.postMessage({ type: 'pause' });
    },
    destroy() {
      worker.terminate();
    }
  };
}

function setButtonEnabled(button, enabled) {
  if (enabled) {
    button.disabled = false;
    button.classList.remove('opacity-50');
  } else {
    button.disabled = true;
    button.classList.add('opacity-50');
  }
}

function prepareExecution() {
  clearLog();

  for (const button of [stepButton, resumeButton, pauseButton, resetButton]) {
    setButtonEnabled(button, false);
  }

  sourceDisplay.innerHTML = '';
  varsDisplay.innerHTML = '';

  const source = sourceInput.value;
  sourceDisplay.textContent = source;

  parseAndCompileProgram(source)
  .then((compiled) => {
    displayLog('Preparing execution...');
    currentExecutionContext = createExecutionContext(compiled);
  })
  .catch((err) => {
    let msg = String(err);
    if (err.location && err.location.start) {
      msg += ` (near line ${err.location.start.line})`;
    }
    displayLog(msg);
  });
}
