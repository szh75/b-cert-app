// 全局状态
let questions = [];
// 修改：初始化错题本，支持旧格式（仅ID）和新格式（题型_ID）
let wrongQuestionIds = new Set();
const storedWrongQuestions = JSON.parse(localStorage.getItem('wrongQuestions') || '[]');
storedWrongQuestions.forEach(item => {
  // 旧格式转换：纯数字ID -> 题型_ID
  if (typeof item === 'number' || (typeof item === 'string' && /^\d+$/.test(item))) {
    const id = parseInt(item);
    const question = questions.find(q => q.id === id);
    if (question) {
      wrongQuestionIds.add(`${question.type}_${id}`);
    }
  } 
  // 新格式：题型_ID
  else if (typeof item === 'string' && item.includes('_')) {
    wrongQuestionIds.add(item);
  }
});
let currentMode = null; // 'review', 'test', 'wrong'
let currentIndex = 0;
let userAnswers = [];
let testQuestions = [];
let startTime = null;
let timerInterval = null;
let currentQuestionList = []; // 新增：保存当前显示的题目列表

// 新增DOM元素引用
const homeScreen = document.getElementById('home-screen');
const questionScreen = document.getElementById('question-screen');
const progressEl = document.getElementById('progress');
const stemEl = document.getElementById('stem');
const optionsEl = document.getElementById('options');
const explanationEl = document.getElementById('explanation');
const timerEl = document.getElementById('timer');

// 新增：将题型代码转换为中文标识
function getTypeText(type) {
  switch(type) {
    case 'single': return '【单选题】';
    case 'multiple': return '【多选题】';
    case 'true_false': return '【判断题】';
    default: return '【未知题型】';
  }
}

// 加载题库
async function loadQuestions() {
  try {
    const response = await fetch('exam_questions.json');
    if (!response.ok) throw new Error('题库加载失败');
    const data = await response.json();
    // 修改: 适配直接数组格式的JSON文件
    questions = Array.isArray(data) ? data : (data.questions || []);
    document.getElementById('status').textContent = `已加载 ${questions.length} 道题目`;
  } catch (err) {
    alert('❌ 无法加载题库文件 exam_questions.json\n\n请确保文件存在且格式正确！');
    console.error(err);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadQuestions();
});

// 新增：关闭服务器功能
function shutdownServer() {
  if (confirm('确定要关闭服务器吗？关闭后将无法继续使用本系统，除非重新启动。')) {
    fetch('/shutdown')
      .then(response => response.json())
      .then(data => {
        if (data.status === 'shutting down') {
          alert('服务器已关闭，请手动关闭此窗口。');
          // 尝试关闭当前窗口（但浏览器通常会阻止非用户触发的window.close()）
          setTimeout(() => {
            window.close();
          }, 1000);
        }
      })
      .catch(error => {
        console.error('关闭服务器失败:', error);
        alert('关闭服务器失败，请使用任务管理器结束进程。');
      });
  }
}

// 切换界面
function showHome() {
  homeScreen.classList.remove('hidden');
  questionScreen.classList.add('hidden');
  currentMode = null;
  if (timerInterval) clearInterval(timerInterval);
}

function showQuestionScreen() {
  homeScreen.classList.add('hidden');
  questionScreen.classList.remove('hidden');
}

// ======================
// 功能入口
// ======================

function startReviewByType(type) {
    if (questions.length === 0) return alert('题库为空！');
    const filteredQuestions = questions.filter(q => q.type === type);
    if (filteredQuestions.length === 0) return alert('该题型暂无题目！');
    currentMode = 'review-' + type; // 修改：使用新的模式标识
    currentQuestionList = filteredQuestions;
    currentIndex = loadProgress(currentMode); // 修改：加载进度
    renderQuestion(currentQuestionList);
}

function startTest() {
  if (questions.length === 0) return alert('题库为空！');
  
  // 定义各题型需要抽取的数量
  const typeCounts = {
    'true_false': 24, // 判断题
    'single': 28,     // 单选题
    'multiple': 24    // 多选题
  };
  
  // 按题型分类题目
  const questionsByType = {
    'true_false': questions.filter(q => q.type === 'true_false'),
    'single': questions.filter(q => q.type === 'single'),
    'multiple': questions.filter(q => q.type === 'multiple')
  };
  
  // 按题型顺序抽取题目（判断题→单选题→多选题）
  let selectedQuestions = [];
  // 先加判断题
  if (questionsByType['true_false'].length > 0) {
    const shuffled = [...questionsByType['true_false']].sort(() => 0.5 - Math.random());
    const numToTake = Math.min(typeCounts['true_false'], shuffled.length);
    selectedQuestions = selectedQuestions.concat(shuffled.slice(0, numToTake));
  }
  // 再加单选题
  if (questionsByType['single'].length > 0) {
    const shuffled = [...questionsByType['single']].sort(() => 0.5 - Math.random());
    const numToTake = Math.min(typeCounts['single'], shuffled.length);
    selectedQuestions = selectedQuestions.concat(shuffled.slice(0, numToTake));
  }
  // 最后加多选题
  if (questionsByType['multiple'].length > 0) {
    const shuffled = [...questionsByType['multiple']].sort(() => 0.5 - Math.random());
    const numToTake = Math.min(typeCounts['multiple'], shuffled.length);
    selectedQuestions = selectedQuestions.concat(shuffled.slice(0, numToTake));
  }
  
  testQuestions = selectedQuestions;
  
  // 检查是否抽到题目
  if (testQuestions.length === 0) {
    alert('无法生成测试，题库中没有足够的题目！');
    return;
  }
  
  userAnswers = new Array(testQuestions.length).fill(null);
  currentMode = 'test';
  currentIndex = 0;
  startTime = Date.now();
  startTimer();
  renderQuestion(testQuestions);
}

function startWrongReview() {
  // 修改: 按题型_ID过滤错题
  const wrongList = questions.filter(q => 
    wrongQuestionIds.has(`${q.type}_${q.id}`)
  );
  if (wrongList.length === 0) {
    alert('暂无错题！');
    return;
  }
  currentMode = 'wrong';
  currentIndex = 0;
  renderQuestion(wrongList);
}

function clearWrongQuestions() {
  if (confirm('确定清空错题本？')) {
    wrongQuestionIds.clear();
    localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestionIds]));
    alert('错题本已清空！');
  }
}

function goHome() {
  showHome();
}

// ======================
// 渲染题目
// ======================

function renderQuestion(questionList) {
  showQuestionScreen();
  const q = questionList[currentIndex];
  const total = questionList.length;

  // 更新进度
  progressEl.textContent = `第 ${currentIndex + 1} / ${total} 题`;

  // 显示题干（修改：添加题型标识）
  stemEl.innerHTML = `<strong>${getTypeText(q.type)} ${q.stem}</strong>`;

  // 清空选项
  optionsEl.innerHTML = '';
  explanationEl.classList.add('hidden');
  explanationEl.textContent = '';

  // 创建选项
  const isTest = currentMode === 'test';
  if (q.type === 'true_false' || q.type === 'single') {
    // 单选
    const selected = isTest ? (userAnswers[currentIndex] || [])[0] : null;
    q.options.forEach((opt, idx) => {
      const div = document.createElement('div');
      div.className = 'option-item';
      if (selected === idx) div.classList.add('selected');
      div.textContent = opt;
      div.onclick = () => selectOption(idx, questionList, false);
      optionsEl.appendChild(div);
    });
  } else {
    // 多选
    const selectedSet = new Set(isTest ? userAnswers[currentIndex] || [] : []);
    q.options.forEach((opt, idx) => {
      const div = document.createElement('div');
      div.className = 'option-item';
      if (selectedSet.has(idx)) div.classList.add('selected');
      div.textContent = opt;
      div.onclick = () => selectOption(idx, questionList, true);
      optionsEl.appendChild(div);
    });
  }

  // 显示/隐藏按钮
  document.getElementById('prev-btn').style.display = currentIndex > 0 ? 'inline-block' : 'none';
  document.getElementById('next-btn').style.display = currentIndex < total - 1 ? 'inline-block' : 'none';
  document.getElementById('submit-btn').style.display = isTest ? 'inline-block' : 'none';
  document.getElementById('check-btn').style.display = isTest ? 'none' : 'inline-block';
}

let currentSelection = [];

function selectOption(index, questionList, isMultiple) {
  const q = questionList[currentIndex];
  if (isMultiple) {
    const set = new Set(currentSelection);
    if (set.has(index)) {
      set.delete(index);
    } else {
      set.add(index);
    }
    currentSelection = [...set];
  } else {
    currentSelection = [index];
  }

  // 如果是测试模式，保存答案
  if (currentMode === 'test') {
    userAnswers[currentIndex] = [...currentSelection];
  }

  // 重新渲染选项高亮
  const items = optionsEl.querySelectorAll('.option-item');
  items.forEach((item, idx) => {
    item.classList.toggle('selected', currentSelection.includes(idx));
  });
}

// ======================
// 导航与提交
// ======================

function prevQuestion() {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion(getCurrentList());
    saveProgress(currentMode, currentIndex); // 新增：保存进度
  }
}

function nextQuestion() {
  const list = getCurrentList();
  if (currentIndex < list.length - 1) {
    currentIndex++;
    renderQuestion(list);
    currentSelection = []; // 重置当前选择（非测试模式）
    saveProgress(currentMode, currentIndex); // 新增：保存进度
  }
}

function getCurrentList() {
  if (currentMode === 'test') return testQuestions;
  if (currentMode === 'wrong') return questions.filter(q => wrongQuestionIds.has(`${q.type}_${q.id}`));
  return currentQuestionList;
}

function checkAnswer() {
  const list = getCurrentList();
  const q = list[currentIndex];
  const correct = new Set(q.answer);
  const userSet = new Set(currentSelection);
  const isCorrect = areSetsEqual(correct, userSet);

  // 修改: 使用题型_ID作为唯一标识
  const questionKey = `${q.type}_${q.id}`;
  
  // 错题复习模式下: 做对则从错题本移除
  if (currentMode === 'wrong') {
    if (isCorrect) {
      wrongQuestionIds.delete(questionKey);
      localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestionIds]));
    }
  } 
  // 复习模式下: 做错添加到错题本
  else if (currentMode.startsWith('review-')) {
    if (!isCorrect) {
      wrongQuestionIds.add(questionKey);
      localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestionIds]));
    }
  }
  // 测试模式下: 通过submitTest处理，此处不处理

  let resultText = isCorrect ? '✅ 正确' : '❌ 错误';
  let correctText = q.answer.map(i => q.options[i]).join('、');
  let msg = `${resultText}\n\n正确答案：${correctText}`;
  if (q.explanation) msg += `\n\n解析：${q.explanation}`;

  explanationEl.textContent = msg;
  explanationEl.classList.remove('hidden');
}

function submitTest() {
  // 保存最后一题
  const list = testQuestions;
  // 修改: 直接保存当前选择，不再检查是否为null，确保最后一题答案正确记录
  userAnswers[currentIndex] = [...currentSelection];
  
  let correct = 0;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    // 修改: 使用题型_ID作为唯一标识
    const questionKey = `${q.type}_${q.id}`;
    const ua = userAnswers[i] || [];
    if (areSetsEqual(new Set(q.answer), new Set(ua))) {
      correct++;
    } else {
      wrongQuestionIds.add(questionKey);
    }
  }
  localStorage.setItem('wrongQuestions', JSON.stringify([...wrongQuestionIds]));

  const score = ((correct / list.length) * 100).toFixed(1);
  const elapsed = Date.now() - startTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  let report = `考试结束！\n\n得分：${score} 分 (${correct}/${list.length})\n用时：${minutes}分${seconds}秒`;
  if (list.length - correct > 0) {
    report += `\n\n答错 ${list.length - correct} 题，已加入错题本。`;
  }

  alert(report);
  showHome();
}

// ======================
// 工具函数
// ======================

function areSetsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (let x of a) if (!b.has(x)) return false;
  return true;
}

// 新增：保存复习进度
function saveProgress(mode, index) {
  // 只保存复习模式的进度
  if (!mode || !mode.startsWith('review-')) return;
  
  const progress = JSON.parse(localStorage.getItem('reviewProgress') || '{}');
  progress[mode] = {
    lastIndex: index,
    timestamp: Date.now()
  };
  localStorage.setItem('reviewProgress', JSON.stringify(progress));
}

// 新增：加载复习进度
function loadProgress(mode) {
  const progress = JSON.parse(localStorage.getItem('reviewProgress') || '{}');
  return progress[mode] ? progress[mode].lastIndex : 0;
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const m = Math.floor(elapsed / 60000);
    const s = Math.floor((elapsed % 60000) / 1000);
    timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}