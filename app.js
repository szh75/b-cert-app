// 全局状态
let questions = [];
// 新增：当前题库类别
let currentCategory = null;
// 修改：初始化错题本，支持旧格式（仅ID）和新格式（题型_ID）
let wrongQuestionIds = new Set();


let currentMode = null; // 'review', 'test', 'wrong'
let currentIndex = 0;
let userAnswers = [];
let testQuestions = [];
let startTime = null;
let timerInterval = null;
let currentQuestionList = []; // 新增：保存当前显示的题目列表

// 新增DOM元素引用
const homeScreen = document.getElementById('home-screen');
const moduleScreen = document.getElementById('module-screen');
const questionScreen = document.getElementById('question-screen');
const moduleTitle = document.getElementById('module-title');
const progressEl = document.getElementById('progress');
const stemEl = document.getElementById('stem');
const optionsEl = document.getElementById('options');
const explanationEl = document.getElementById('explanation');
const timerEl = document.getElementById('timer');

// 新增：获取当前模块的错题本键名
function getWrongQuestionsKey() {
  return currentCategory ? `wrongQuestions_${currentCategory}` : 'wrongQuestions';
}

// 新增：加载当前模块的错题本
function loadWrongQuestions() {
  if (!currentCategory) {
    wrongQuestionIds = new Set();
    return;
  }
  
  const key = getWrongQuestionsKey();
  const storedWrongQuestions = JSON.parse(localStorage.getItem(key) || '[]');
  wrongQuestionIds = new Set();
  
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
}

// 新增：保存当前模块的错题本
function saveWrongQuestions() {
  if (!currentCategory) return;
  const key = getWrongQuestionsKey();
  localStorage.setItem(key, JSON.stringify([...wrongQuestionIds]));
}

// 新增：将题型代码转换为中文标识
function getTypeText(type) {
  switch(type) {
    case 'single': return '【单选题】';
    case 'multiple': return '【多选题】';
    case 'true_false': return '【判断题】';
    default: return '【未知题型】';
  }
}

// 新增：启动模块
function startModule(category) {
  currentCategory = category;
  // 设置模块标题
  const titles = {
    'required': '建筑工程必修',
    'elective': '建筑工程选修',
    'b_cert': 'B证继续教育'
  };
  moduleTitle.textContent = titles[category] || '题库模块';
  
  // 显示模块主页
  homeScreen.classList.add('hidden');
  moduleScreen.classList.remove('hidden');
  questionScreen.classList.add('hidden');

  // 加载对应模块的题库
  loadQuestionsForCategory(category);
}

// 新增：按类别加载题库
async function loadQuestionsForCategory(category) {
  const fileMap = {
    'required': 'exam_questions_required.json',
    'elective': 'exam_questions_elective.json',
    'b_cert': 'exam_questions_b_cert.json'
  };
  const filename = fileMap[category] || 'exam_questions.json';
  
  try {
    const response = await fetch(filename);
    if (!response.ok) throw new Error(`题库加载失败: ${filename}`);
    const data = await response.json();
    questions = Array.isArray(data) ? data : (data.questions || []);
    
    // 新增：为所有题目添加 category 字段，确保过滤条件能匹配
    questions.forEach(q => {
      q.category = category;
    });
    
    // 加载当前模块的错题本
    loadWrongQuestions();
    
    // 更新状态显示
    updateStatus();
  } catch (err) {
    alert(`❌ 无法加载题库文件 ${filename}\n\n请确保文件存在且格式正确！`);
    console.error(err);
    // 回退到主菜单
    goHome();
  }
}

// 修改：返回主菜单
function goHome() {
  homeScreen.classList.remove('hidden');
  moduleScreen.classList.add('hidden');
  questionScreen.classList.add('hidden');
  currentCategory = null;
  questions = []; // 清空题目
  wrongQuestionIds = new Set(); // 清空错题本
}

// 新增：返回模块主页
function goModuleHome() {
  moduleScreen.classList.remove('hidden');
  questionScreen.classList.add('hidden');
}

// 新增：更新状态显示
function updateStatus() {
  if (!currentCategory) return;
  
  // 按类别过滤题目（现在所有题目都属于当前类别）
  document.getElementById('status').textContent = `已加载 ${questions.length} 道题目`;
}

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

// 修改：按类别和题型过滤
function startReviewByType(type) {
  if (questions.length === 0) return alert('题库为空！');
  
  // 按当前类别和题型过滤
  const filteredQuestions = questions.filter(q => 
    q.category === currentCategory && q.type === type
  );
  if (filteredQuestions.length === 0) return alert('该题型暂无题目！');
  
  currentMode = 'review-' + type;
  currentQuestionList = filteredQuestions;
  currentIndex = loadProgress(currentMode);
  moduleScreen.classList.add('hidden'); // 新增：隐藏子模块主页
  renderQuestion(currentQuestionList);
}

// 修改：模拟测试按类别抽取
function startTest() {
  if (questions.length === 0) return alert('题库为空！');
  
  // 按当前类别过滤题目
  const categoryQuestions = questions.filter(q => q.category === currentCategory);
  if (categoryQuestions.length === 0) return alert('当前类别无题目！');
  
  // 定义各题型需要抽取的数量
  const typeCounts = {
    'true_false': 24,
    'single': 28,
    'multiple': 24
  };
  
  // 按题型分类题目
  const questionsByType = {
    'true_false': categoryQuestions.filter(q => q.type === 'true_false'),
    'single': categoryQuestions.filter(q => q.type === 'single'),
    'multiple': categoryQuestions.filter(q => q.type === 'multiple')
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
  
  if (testQuestions.length === 0) {
    alert('无法生成测试，题库中没有足够的题目！');
    return;
  }
  
  userAnswers = new Array(testQuestions.length).fill(null);
  currentMode = 'test';
  currentIndex = 0;
  startTime = Date.now();
  startTimer();
  moduleScreen.classList.add('hidden'); // 新增：隐藏子模块主页
  renderQuestion(testQuestions);
}

// 修改：错题复习按类别过滤
function startWrongReview() {
  // 按当前类别过滤错题
  const wrongList = questions.filter(q => 
    q.category === currentCategory && 
    wrongQuestionIds.has(`${q.type}_${q.id}`)
  );
  if (wrongList.length === 0) {
    alert('暂无错题！');
    return;
  }
  currentMode = 'wrong';
  currentIndex = 0;
  moduleScreen.classList.add('hidden'); // 新增：隐藏子模块主页
  renderQuestion(wrongList);
}

function clearWrongQuestions() {
  if (confirm('确定清空错题本？')) {
    wrongQuestionIds.clear();
    saveWrongQuestions(); // 修改：保存当前模块的错题本
    alert('错题本已清空！');
  }
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

// 修改：获取当前题目列表
function getCurrentList() {
  if (currentMode === 'test') return testQuestions;
  if (currentMode === 'wrong') {
    return questions.filter(q => 
      q.category === currentCategory && 
      wrongQuestionIds.has(`${q.type}_${q.id}`)
    );
  }
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
      saveWrongQuestions(); // 修改：保存当前模块的错题本
    }
  } 
  // 复习模式下: 做错添加到错题本
  else if (currentMode.startsWith('review-')) {
    if (!isCorrect) {
      wrongQuestionIds.add(questionKey);
      saveWrongQuestions(); // 修改：保存当前模块的错题本
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
  saveWrongQuestions(); // 修改：保存当前模块的错题本

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

// 新增：获取当前模块的复习进度键名
function getReviewProgressKey() {
  return currentCategory ? `reviewProgress_${currentCategory}` : 'reviewProgress';
}

// 修改：保存复习进度（按模块隔离）
function saveProgress(mode, index) {
  // 只保存复习模式的进度
  if (!mode || !mode.startsWith('review-')) return;
  
  const key = getReviewProgressKey();
  const progress = JSON.parse(localStorage.getItem(key) || '{}');
  progress[mode] = {
    lastIndex: index,
    timestamp: Date.now()
  };
  localStorage.setItem(key, JSON.stringify(progress));
}

// 修改：加载复习进度（按模块隔离）
function loadProgress(mode) {
  const key = getReviewProgressKey();
  const progress = JSON.parse(localStorage.getItem(key) || '{}');
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
