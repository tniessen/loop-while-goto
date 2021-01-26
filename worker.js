'use strict';

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

  let _nSteps = 0;
  const _vars = {};
  for (const name of variableNames)
    _vars[name] = 0;
  let _programCounter = 0;
  const _stack = [];
  const cpu = {
    get totalSteps() {
      return _nSteps;
    },
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
    const oldStack = [..._stack];
    const fn = impl[opcode];
    if (fn) {
      fn(operand);
    } else {
      throw new Error(`Invalid opcode: ${opcode}`);
    }

    _nSteps++;
  }

  return {
    variableNames,
    cpu
  };
}

let currentVm;
let isRunning = false;
let resumeCodeExecutionTimeout;

function postState() {
  const vars = {};
  for (const name of currentVm.variableNames) {
    vars[name] = currentVm.cpu.get(name);
  }

  const { pc, reachedEndOfCode, totalSteps } = currentVm.cpu;
  postMessage({ pc, vars, reachedEndOfCode, isRunning, totalSteps });
}

function doSingleStep() {
  stopCodeExecution();

  const { cpu } = currentVm;
  if (!cpu.reachedEndOfCode) {
    cpu.step();
  }

  postState();
}

function resumeCodeExecution() {
  isRunning = true;

  if (resumeCodeExecutionTimeout !== undefined) {
    clearTimeout(resumeCodeExecutionTimeout);
    resumeCodeExecutionTimeout = undefined;
  }

  const pauseAt = Date.now() + 500;
  const { cpu } = currentVm;
  do {
    for (let i = 0; i < 100; i++) {
      cpu.step();
    }
  } while (!cpu.reachedEndOfCode && Date.now() < pauseAt);

  if ((isRunning = !cpu.reachedEndOfCode)) {
    // Pause for a few milliseconds to receive commands from the main thread.
    resumeCodeExecutionTimeout = setTimeout(() => {
      resumeCodeExecutionTimeout = undefined;
      resumeCodeExecution();
    }, 10);
  }

  postState();
}

function stopCodeExecution() {
  if (resumeCodeExecutionTimeout !== undefined) {
    clearTimeout(resumeCodeExecutionTimeout);
    resumeCodeExecutionTimeout = undefined;
  }

  isRunning = false;
}

onmessage = function(event) {
  const data = event.data;

  console.log('Worker received', data);

  if (data.type === 'init') {
    const code = data.code;
    if (currentVm !== undefined) {
      stopCodeExecution();
    }
    currentVm = initVirtualMachine(code);
    postState();
  } else if (data.type === 'resume') {
    resumeCodeExecution();
  } else if (data.type === 'pause') {
    stopCodeExecution();
    postState();
  } else if (data.type === 'step') {
    doSingleStep();
  }
};
