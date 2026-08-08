// Dataset Viewer JavaScript functionality
class DatasetViewer {
  constructor() {
    this.allData = [];
    this.filteredData = [];
    this.currentIndex = 0;
    this.currentSetting = '';
    
    this.init();
  }

  async init() {
    try {
      await this.loadData();
      this.setupEventListeners();
      this.updateUI();
    } catch (error) {
      console.error('Failed to initialize dataset viewer:', error);
      this.showError('Failed to load dataset');
    }
  }

  async loadData() {
    try {
      const response = await fetch('/data_viewer/MindCube_tinybench.jsonl');
      const text = await response.text();
      
      // Parse JSONL (each line is a JSON object)
      this.allData = text
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      
      console.log(`Loaded ${this.allData.length} samples`);
      this.filterData();
    } catch (error) {
      console.error('Error loading data:', error);
      throw error;
    }
  }

  filterData() {
    if (this.currentSetting) {
      this.filteredData = this.allData.filter(item => 
        item.id && item.id.startsWith(this.currentSetting)
      );
    } else {
      this.filteredData = [...this.allData];
    }
    
    // Reset current index when filtering
    this.currentIndex = 0;
    this.updateIdSelector();
  }

  updateIdSelector() {
    const idSelect = document.getElementById('id-select');
    
    // Clear existing options
    idSelect.innerHTML = '';
    
    // Add options for filtered data
    this.filteredData.forEach((item, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = item.id || `Sample ${index + 1}`;
      idSelect.appendChild(option);
    });
    
    // Set current selection
    if (this.filteredData.length > 0) {
      idSelect.value = this.currentIndex;
    }
  }

  setupEventListeners() {
    // Setting filter
    const settingSelect = document.getElementById('setting-select');
    settingSelect.addEventListener('change', (e) => {
      this.currentSetting = e.target.value;
      this.filterData();
      this.updateUI();
    });

    // ID selector
    const idSelect = document.getElementById('id-select');
    idSelect.addEventListener('change', (e) => {
      this.currentIndex = parseInt(e.target.value) || 0;
      this.updateUI();
    });

    // Navigation buttons
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    prevBtn.addEventListener('click', () => {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.updateUI();
      }
    });

    nextBtn.addEventListener('click', () => {
      if (this.currentIndex < this.filteredData.length - 1) {
        this.currentIndex++;
        this.updateUI();
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      
      if (e.key === 'ArrowLeft' && this.currentIndex > 0) {
        this.currentIndex--;
        this.updateUI();
      } else if (e.key === 'ArrowRight' && this.currentIndex < this.filteredData.length - 1) {
        this.currentIndex++;
        this.updateUI();
      }
    });
  }

  updateUI() {
    const dataDisplay = document.getElementById('data-display');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const idSelect = document.getElementById('id-select');

    // Update navigation buttons
    prevBtn.disabled = this.currentIndex === 0;
    nextBtn.disabled = this.currentIndex >= this.filteredData.length - 1;

    // Update ID selector
    idSelect.value = this.currentIndex;

    // Update data display
    if (this.filteredData.length === 0) {
      dataDisplay.innerHTML = this.getNoDataHTML();
      dataDisplay.classList.add('loaded');
      return;
    }

    const currentData = this.filteredData[this.currentIndex];
    if (currentData) {
      dataDisplay.innerHTML = this.getSampleHTML(currentData);
      dataDisplay.classList.add('loaded');
    }
  }

  getSampleHTML(data) {
    const images = data.images || [];
    const imageLabels = ['View 1', 'View 2', 'View 3', 'View 4'];
    
    // 解析question和选项
    const { questionText, options } = this.parseQuestionAndOptions(data.question || 'No question available');
    
    return `
      <div class="sample-container">
        <!-- Sample Header -->
        <div class="sample-header">
          <div class="sample-id">${data.id || 'Unknown ID'}</div>
          <div class="sample-meta">
            Sample ${this.currentIndex + 1} of ${this.filteredData.length}
            ${this.currentSetting ? ` • Setting: ${this.currentSetting.charAt(0).toUpperCase() + this.currentSetting.slice(1)}` : ''}
          </div>
        </div>

        <!-- 严格双列布局容器 -->
        <div class="dual-column-container">
          <!-- 左列: Images + Question -->
          <div class="left-column">
            <!-- Images Card - 优化图片尺寸 -->
            <div class="content-card images-card">
              <div class="card-header">
                <svg class="card-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                <h3 class="card-title">Multi-View Images</h3>
              </div>
              <div class="card-content">
                <div class="images-grid">
                  ${images.slice(0, 4).map((img, index) => `
                    <div class="image-item">
                      <img src="/data_viewer/${img}" 
                           alt="View ${index + 1}" 
                           onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'display:flex; align-items:center; justify-content:center; height:100%; background:#f3f4f6; color:#9ca3af; font-size:0.75rem\\'>Image not found</div>'"
                           loading="lazy">
                      <div class="image-label">${imageLabels[index] || `View ${index + 1}`}</div>
                    </div>
                  `).join('')}
                  ${images.length < 4 ? Array(4 - images.length).fill(0).map((_, index) => `
                    <div class="image-item">
                      <div style="display:flex; align-items:center; justify-content:center; height:100%; background:#f3f4f6; color:#9ca3af; font-size:0.75rem;">
                        No Image
                      </div>
                      <div class="image-label">${imageLabels[images.length + index] || `View ${images.length + index + 1}`}</div>
                    </div>
                  `).join('') : ''}
                </div>
              </div>
            </div>

            <!-- Question Card -->
            <div class="content-card question-card">
              <div class="card-header">
                <svg class="card-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h3 class="card-title">Question</h3>
              </div>
              <div class="card-content">
                <p class="question-text">${questionText}</p>
                ${options.length > 0 ? `
                <div class="options-container">
                  <h4 class="options-title">Answer Choices:</h4>
                  <div class="options-list">
                    ${options.map(option => `
                      <div class="option-item">
                        <span class="option-label">${option.label}</span>
                        <span class="option-text">${option.text}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- 右列: CogMap + Reasoning + Answer -->
          <div class="right-column">
            <!-- CogMap Card - 改进显示 -->
            <div class="content-card cogmap-card">
              <div class="card-header">
                <svg class="card-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
                </svg>
                <h3 class="card-title">Cognitive Map</h3>
              </div>
              <div class="card-content">
                <div class="cogmap-content">${this.formatCogMap(data.grounded_cogmap || data.cogmap || data.world_states || {})}</div>
              </div>
            </div>

            <!-- Reasoning Chain Card -->
            <div class="content-card reasoning-card">
              <div class="card-header">
                <svg class="card-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
                <h3 class="card-title">Reasoning Chain</h3>
              </div>
              <div class="card-content">
                <div class="reasoning-content">
                  ${this.formatReasoningChain(data.reasoning_chain || data.cot || data.reasoning || 'No reasoning chain available')}
                </div>
              </div>
            </div>

            <!-- Ground Truth Answer Card -->
            <div class="content-card answer-card">
              <div class="card-header">
                <svg class="card-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h3 class="card-title">Ground Truth Answer</h3>
              </div>
              <div class="card-content">
                <div class="answer-content">
                  <div class="answer-label">Correct Answer</div>
                  <div class="answer-text">${data.gt_answer || data.answer || 'N/A'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 解析问题和选项
  parseQuestionAndOptions(questionText) {
    if (!questionText || typeof questionText !== 'string') {
      return { questionText: 'No question available', options: [] };
    }

    // 查找第一个选项的位置
    const firstOptionMatch = questionText.match(/\s+A\.\s+/);
    
    if (!firstOptionMatch) {
      // 没有找到选项，返回整个文本
      return { questionText, options: [] };
    }

    const questionPart = questionText.substring(0, firstOptionMatch.index).trim();
    const optionsPart = questionText.substring(firstOptionMatch.index).trim();

    // 使用改进的正则表达式，处理选项间可能只有一个空格的情况
    const options = [];
    
    // 方法1：直接按照A. B. C. D.的模式分割
    // 先将文本按选项标记分割 - 修复：移除\s+，允许选项在开头
    const segments = optionsPart.split(/([A-D])\.\s+/);
    
    // segments[0]是第一个"A."之前的部分（通常为空）
    // segments[1]是"A", segments[2]是A的内容
    // segments[3]是"B", segments[4]是B的内容，以此类推
    
    for (let i = 1; i < segments.length; i += 2) {
      if (i + 1 < segments.length) {
        const label = segments[i];
        let text = segments[i + 1];
        
        // 清理文本，移除可能的尾随空格和下一个选项的开头
        text = text.trim();
        
        if (label && text) {
          options.push({
            label: label,
            text: text
          });
        }
      }
    }

    // 如果第一种方法失败，使用备用方法
    if (options.length === 0) {
      // 备用方法：逐个查找每个选项
      const labels = ['A', 'B', 'C', 'D'];
      
      labels.forEach(label => {
        const regex = new RegExp(`${label}\\.\\s+([^A-D]*?)(?=\\s+[A-D]\\.|$)`, 'g');
        const match = regex.exec(optionsPart);
        
        if (match && match[1].trim()) {
          options.push({
            label: label,
            text: match[1].trim()
          });
        }
      });
    }

    console.log('Question parsing debug:', {
      original: questionText,
      questionPart: questionPart,
      optionsPart: optionsPart,
      segments: segments,
      options: options
    });

    return {
      questionText: questionPart,
      options: options
    };
  }

  // 格式化CogMap显示
  formatCogMap(cogmap) {
    if (typeof cogmap === 'string') {
      try {
        // 尝试解析JSON字符串
        const parsed = JSON.parse(cogmap);
        return JSON.stringify(parsed, null, 2);
      } catch (e) {
        // 如果不是JSON，直接返回原始文本，但格式化显示
        return cogmap.replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
    } else if (typeof cogmap === 'object' && cogmap !== null) {
      // 如果已经是对象，格式化显示
      return JSON.stringify(cogmap, null, 2);
    } else {
      return 'No cognitive map data available';
    }
  }

  // 格式化推理链显示
  formatReasoningChain(reasoning) {
    if (typeof reasoning === 'string' && reasoning.trim() !== '') {
      // 改进的句子分割逻辑，避免在答案选项处分割
      // 先替换掉答案选项中的句号，避免错误分割
      let processedText = reasoning
        .replace(/([A-D])\.\s+([^.]*?)(\.|$)/g, (match, letter, text, ending) => {
          // 将答案选项中的句号替换为特殊标记
          return `${letter}❋ ${text}${ending === '.' ? '❋❋' : ending}`;
        });

      // 按句号分割句子
      const sentences = processedText
        .split(/\.\s+/)
        .filter(s => s.trim().length > 0)
        .map(sentence => {
          // 恢复答案选项中的句号
          return sentence
            .replace(/❋❋/g, '.')
            .replace(/❋/g, '.')
            .trim();
        });

      if (sentences.length > 1) {
        return `
          <ul class="reasoning-steps">
            ${sentences.map((sentence, index) => `
              <li class="reasoning-step">
                <span class="step-number">${index + 1}</span>
                <span class="step-text">${sentence}${sentence.endsWith('.') ? '' : '.'}</span>
              </li>
            `).join('')}
          </ul>
        `;
      } else {
        return `<p>${reasoning}</p>`;
      }
    } else {
      return `<p>No reasoning chain available</p>`;
    }
  }

  getNoDataHTML() {
    return `
      <div style="text-align: center; padding: 3rem; color: #64748b;">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 1rem; opacity: 0.5;">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="M21 21l-4.35-4.35"></path>
        </svg>
        <h3 style="margin-bottom: 0.5rem; color: #334155;">No data found</h3>
        <p>No samples match the current filter criteria.</p>
      </div>
    `;
  }

  showError(message) {
    const dataDisplay = document.getElementById('data-display');
    dataDisplay.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: #ef4444;">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 1rem;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <h3 style="margin-bottom: 0.5rem;">Error Loading Dataset</h3>
        <p>${message}</p>
      </div>
    `;
  }
}

// Initialize dataset viewer
export function initDatasetViewer() {
  new DatasetViewer();
}

// Auto-initialize if this script is loaded directly
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initDatasetViewer);
} 