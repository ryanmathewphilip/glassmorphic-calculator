// State variables
let currentInput = "0";
let expression = "";
let lastResult = null;
let isEvaluated = false;
let isMuted = localStorage.getItem("calc-muted") === "true";
let history = JSON.parse(localStorage.getItem("calc-history")) || [];

// DOM Elements
const displayInput = document.getElementById("display-input");
const displayExpression = document.getElementById("display-expression");
const themeToggle = document.getElementById("theme-toggle");
const soundToggle = document.getElementById("sound-toggle");
const historyToggle = document.getElementById("history-toggle");
const historyPanel = document.getElementById("history-panel");
const closeHistory = document.getElementById("close-history");
const clearHistory = document.getElementById("clear-history");
const historyList = document.getElementById("history-list");
const calculatorCard = document.getElementById("calculator-card");

// Audio Context for UI Sounds
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Play synth click sound
function playClickSound(type) {
  if (isMuted) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Custom sound profiles depending on key function
    if (type === 'operator') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
    } else if (type === 'equals') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
    } else if (type === 'functional') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(349.23, audioCtx.currentTime); // F4
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    } else {
      // Numbers and dot
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
    }
    
    // Quick exponential decay to create a clean click
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    console.error("Audio error: ", e);
  }
}

// Format floating numbers cleanly
function formatNumber(numStr) {
  if (numStr === "Error" || numStr === "NaN" || numStr === "Infinity") return numStr;
  
  // Split decimals
  const parts = numStr.split(".");
  // Format integer part with commas
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

// Remove commas for mathematical evaluation
function cleanNumber(numStr) {
  return numStr.replace(/,/g, "");
}

// Adjust display font size if input is too long
function updateDisplayFontSize() {
  const len = currentInput.length;
  displayInput.classList.remove("small-text", "tiny-text");
  
  if (len > 16) {
    displayInput.classList.add("tiny-text");
  } else if (len > 10) {
    displayInput.classList.add("small-text");
  }
}

// Safely update screen
function updateScreen() {
  displayInput.innerText = formatNumber(currentInput);
  
  // Format operations visually on expression bar (e.g. * -> ×, / -> ÷)
  let visualExpr = expression
    .replace(/\*/g, " &times; ")
    .replace(/\//g, " &divide; ")
    .replace(/\+/g, " + ")
    .replace(/\-/g, " &minus; ");
  
  displayExpression.innerHTML = visualExpr;
  updateDisplayFontSize();
  
  // Scroll inputs to end to keep view active
  displayInput.scrollLeft = displayInput.scrollWidth;
  displayExpression.scrollLeft = displayExpression.scrollWidth;
}

// Sound toggle behavior
function setupSoundToggle() {
  if (isMuted) {
    document.body.classList.add("audio-muted");
  } else {
    document.body.classList.remove("audio-muted");
  }
  
  soundToggle.addEventListener("click", () => {
    isMuted = !isMuted;
    localStorage.setItem("calc-muted", isMuted);
    if (isMuted) {
      document.body.classList.add("audio-muted");
    } else {
      document.body.classList.remove("audio-muted");
      playClickSound("number");
    }
  });
}

// Theme toggle behavior
function setupThemeToggle() {
  // Load saved preference or check system prefers-color-scheme
  const savedTheme = localStorage.getItem("calc-theme");
  if (savedTheme === "light") {
    document.body.classList.remove("dark-theme");
    document.body.classList.add("light-theme");
  } else {
    document.body.classList.add("dark-theme");
    document.body.classList.remove("light-theme");
  }

  themeToggle.addEventListener("click", () => {
    playClickSound("functional");
    if (document.body.classList.contains("dark-theme")) {
      document.body.classList.remove("dark-theme");
      document.body.classList.add("light-theme");
      localStorage.setItem("calc-theme", "light");
    } else {
      document.body.classList.remove("light-theme");
      document.body.classList.add("dark-theme");
      localStorage.setItem("calc-theme", "dark");
    }
  });
}

// Parse and evaluate general expression safely with standard precedence (MDAS)
// Excludes use of eval()
function evaluateExpression(exprStr) {
  try {
    // 1. Tokenize expression string (numbers and operators)
    const tokens = [];
    let numberBuffer = "";
    
    for (let i = 0; i < exprStr.length; i++) {
      const char = exprStr[i];
      
      // Allow negative numbers if '-' is at start or follows another operator
      if (char === '-' && (tokens.length === 0 || ['+', '-', '*', '/'].includes(tokens[tokens.length - 1])) && numberBuffer === "") {
        numberBuffer += char;
        continue;
      }
      
      if (/[0-9.]/.test(char)) {
        numberBuffer += char;
      } else if (['+', '-', '*', '/'].includes(char)) {
        if (numberBuffer !== "") {
          tokens.push(parseFloat(numberBuffer));
          numberBuffer = "";
        }
        tokens.push(char);
      }
    }
    
    if (numberBuffer !== "") {
      tokens.push(parseFloat(numberBuffer));
    }
    
    if (tokens.length === 0) return 0;
    
    // Guard against expressions ending in operator
    if (['+', '-', '*', '/'].includes(tokens[tokens.length - 1])) {
      tokens.pop();
    }
    
    // 2. First Pass: Multiplication and Division
    const mdTokens = [];
    let idx = 0;
    while (idx < tokens.length) {
      const token = tokens[idx];
      if (token === '*' || token === '/') {
        const prevNum = mdTokens.pop();
        const nextNum = tokens[idx + 1];
        if (nextNum === undefined) {
          mdTokens.push(prevNum); // restore
        } else {
          let result = 0;
          if (token === '*') {
            result = prevNum * nextNum;
          } else {
            if (nextNum === 0) return "Error"; // Prevent division by zero
            result = prevNum / nextNum;
          }
          mdTokens.push(result);
          idx++; // Skip next operand
        }
      } else {
        mdTokens.push(token);
      }
      idx++;
    }
    
    // 3. Second Pass: Addition and Subtraction
    if (mdTokens.length === 0) return 0;
    let finalResult = mdTokens[0];
    idx = 1;
    while (idx < mdTokens.length) {
      const op = mdTokens[idx];
      const nextVal = mdTokens[idx + 1];
      if (nextVal !== undefined) {
        if (op === '+') {
          finalResult += nextVal;
        } else if (op === '-') {
          finalResult -= nextVal;
        }
      }
      idx += 2;
    }
    
    // Precision format rounding (solve floating precision like 0.1 + 0.2)
    const precisionResult = Number(Math.round(finalResult + 'e12') + 'e-12');
    
    // Exponent conversion if too massive
    if (Math.abs(precisionResult) > 1e14) {
      return precisionResult.toExponential(6);
    }
    
    return precisionResult.toString();
  } catch (e) {
    return "Error";
  }
}

// Execute calculator operations
function handleInput(val, type) {
  // AC / Clear Everything
  if (val === "clear") {
    playClickSound("functional");
    currentInput = "0";
    expression = "";
    lastResult = null;
    isEvaluated = false;
    updateScreen();
    return;
  }
  
  // Backspace single character
  if (val === "backspace") {
    playClickSound("functional");
    if (isEvaluated) {
      expression = "";
      isEvaluated = false;
    }
    
    let raw = cleanNumber(currentInput);
    if (raw === "Error" || raw === "Infinity" || raw === "-Infinity" || raw === "NaN") {
      currentInput = "0";
    } else if (raw.length > 1) {
      currentInput = raw.slice(0, -1);
    } else {
      currentInput = "0";
    }
    updateScreen();
    return;
  }
  
  // Percent modification
  if (val === "%") {
    playClickSound("functional");
    let raw = parseFloat(cleanNumber(currentInput));
    if (!isNaN(raw)) {
      currentInput = (raw / 100).toString();
      isEvaluated = false;
      updateScreen();
    }
    return;
  }
  
  // Operators
  if (['+', '-', '*', '/'].includes(val)) {
    playClickSound("operator");
    let rawInput = cleanNumber(currentInput);
    
    if (rawInput === "Error" || rawInput === "-") return;
    
    if (isEvaluated) {
      expression = rawInput + val;
      isEvaluated = false;
      currentInput = "0";
    } else {
      // Check if user is typing a negative sign, e.g., after an operator like "5 * -" or "5 / -"
      if (val === '-' && rawInput === "0" && expression !== "") {
        const lastChar = expression.trim().slice(-1);
        if (['+', '-', '*', '/'].includes(lastChar)) {
          currentInput = "-";
          updateScreen();
          return;
        }
      }

      if (rawInput === "0" && expression !== "") {
        // If they just type an operator after another, swap operators
        const lastChar = expression.trim().slice(-1);
        if (['+', '-', '*', '/'].includes(lastChar)) {
          expression = expression.trim().slice(0, -1) + val;
        } else {
          expression += val;
        }
      } else {
        expression += rawInput + val;
        currentInput = "0";
      }
    }
    updateScreen();
    return;
  }
  
  // Calculation / Equals
  if (val === "=") {
    playClickSound("equals");
    let rawInput = cleanNumber(currentInput);
    
    if (rawInput === "Error" || expression === "") return;
    
    let fullExpr = expression + rawInput;
    let result = evaluateExpression(fullExpr);
    
    // Store in history log
    if (result !== "Error") {
      addHistoryItem(fullExpr, result);
    }
    
    currentInput = result;
    expression = "";
    isEvaluated = true;
    updateScreen();
    return;
  }
  
  // Number inputs / Decimals
  playClickSound("number");
  let raw = cleanNumber(currentInput);
  
  if (isEvaluated) {
    raw = "0";
    isEvaluated = false;
  }
  
  if (val === ".") {
    if (!raw.includes(".")) {
      currentInput = raw + ".";
    }
  } else if (val === "00") {
    if (raw !== "0") {
      currentInput = raw + "00";
    }
  } else {
    // Normal digit press
    if (raw === "0") {
      currentInput = val;
    } else {
      // Set cap to 16 digits
      if (raw.replace(/\D/g, "").length < 16) {
        currentInput = raw + val;
      }
    }
  }
  
  updateScreen();
}

// Create click listeners for all keypad buttons
function setupKeypadEvents() {
  const buttons = document.querySelectorAll(".btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.getAttribute("data-val");
      let type = "number";
      if (btn.classList.contains("btn-operator")) type = "operator";
      else if (btn.classList.contains("btn-functional")) type = "functional";
      else if (btn.classList.contains("btn-equals")) type = "equals";
      
      handleInput(val, type);
    });
  });
}

// Map keydown inputs to standard calculator triggers
function setupKeyboardEvents() {
  const keyMap = {
    "0": "key-0",
    "1": "key-1",
    "2": "key-2",
    "3": "key-3",
    "4": "key-4",
    "5": "key-5",
    "6": "key-6",
    "7": "key-7",
    "8": "key-8",
    "9": "key-9",
    ".": "key-decimal",
    "+": "key-add",
    "-": "key-subtract",
    "*": "key-multiply",
    "/": "key-divide",
    "%": "key-percent",
    "Enter": "key-equals",
    "=": "key-equals",
    "Backspace": "key-backspace",
    "Escape": "key-clear",
    "c": "key-clear",
    "C": "key-clear"
  };
  
  window.addEventListener("keydown", (e) => {
    const btnId = keyMap[e.key];
    if (btnId) {
      e.preventDefault();
      const btn = document.getElementById(btnId);
      if (btn) {
        // Visual active trigger feedback
        btn.classList.add("active");
        btn.click();
        
        // Remove active styling trigger shortly after
        setTimeout(() => {
          btn.classList.remove("active");
        }, 120);
      }
    }
  });
}

// ==========================================================================
// History Panel Log Management
// ==========================================================================
function renderHistory() {
  historyList.innerHTML = "";
  if (history.length === 0) {
    historyList.innerHTML = `<div class="history-empty">No calculations yet</div>`;
    return;
  }
  
  history.slice().reverse().forEach((item, index) => {
    const itemEl = document.createElement("div");
    itemEl.className = "history-item";
    
    // Format visual display for history list
    let visualExpr = item.expr
      .replace(/\*/g, " &times; ")
      .replace(/\//g, " &divide; ")
      .replace(/\+/g, " + ")
      .replace(/\-/g, " &minus; ");

    itemEl.innerHTML = `
      <div class="history-item-expr">${visualExpr} =</div>
      <div class="history-item-res">${formatNumber(item.res)}</div>
    `;
    
    // Clicking history item restores it to standard display
    itemEl.addEventListener("click", () => {
      playClickSound("number");
      currentInput = item.res;
      expression = "";
      isEvaluated = true;
      updateScreen();
      historyPanel.classList.remove("active");
    });
    
    historyList.appendChild(itemEl);
  });
}

function addHistoryItem(expr, res) {
  // Push item and cap at 30 items
  history.push({ expr, res });
  if (history.length > 30) {
    history.shift();
  }
  localStorage.setItem("calc-history", JSON.stringify(history));
  renderHistory();
}

function setupHistoryEvents() {
  historyToggle.addEventListener("click", () => {
    playClickSound("functional");
    historyPanel.classList.add("active");
    renderHistory();
  });
  
  closeHistory.addEventListener("click", () => {
    playClickSound("functional");
    historyPanel.classList.remove("active");
  });
  
  clearHistory.addEventListener("click", () => {
    playClickSound("functional");
    history = [];
    localStorage.removeItem("calc-history");
    renderHistory();
  });

  // Close panel if clicked outside
  document.addEventListener("mousedown", (e) => {
    if (historyPanel.classList.contains("active") && 
        !historyPanel.contains(e.target) && 
        !historyToggle.contains(e.target)) {
      historyPanel.classList.remove("active");
    }
  });
}

// Initialise Application
document.addEventListener("DOMContentLoaded", () => {
  setupThemeToggle();
  setupSoundToggle();
  setupKeypadEvents();
  setupKeyboardEvents();
  setupHistoryEvents();
  updateScreen();
  renderHistory();
});
