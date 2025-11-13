'use client';

import { useState, useEffect, useRef } from 'react';
import '@/app/globals.css';

interface Alignment {
  source: string;
  target: string;
}

interface TranslationResult {
  translation: string;
  alignments: Alignment[];
}

interface VisualAlignment {
  source: number;
  target: number;
  sourceToken: string;
  targetToken: string;
  score: number;
  groupId?: number;
  isPhrase?: boolean;
}

const CONFIG = {
  model: 'gpt-4o',
  dutchSentences: [
    'De kat slaapt op de bank.',
    'Ik hou van Nederlandse kaas en stroopwafels.',
    'Het weer is vandaag erg mooi en zonnig.',
    'Mijn broer woont in Amsterdam bij het kanaal.',
    'We gaan morgen naar de markt om groenten te kopen.',
  ],
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [sourceLang, setSourceLang] = useState('Dutch');
  const [targetLang, setTargetLang] = useState('English');
  const [logs, setLogs] = useState<Array<{ message: string; type: string; timestamp: string }>>([]);
  const [logVisible, setLogVisible] = useState(true);
  const [visualizations, setVisualizations] = useState<Array<{ id: string; sourceTokens: string[]; targetTokens: string[]; alignments: VisualAlignment[] }>>([]);
  
  const visualizationRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const log = (message: string, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [...prev, { message, type, timestamp }]);
  };

  const tokenize = (text: string): string[] => {
    return text
      .toLowerCase()
      .replace(/[.,!?;:"'()\[\]{}]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 0);
  };

  const splitIntoSentences = (text: string): string[] => {
    const sentences = text
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);
    return sentences.length > 0 ? sentences : [text.trim()];
  };

  const findNextPhraseIndex = (tokens: string[], phrase: string[], usedIndices: Set<number>): number => {
    for (let i = 0; i <= tokens.length - phrase.length; i++) {
      let positionUsed = false;
      for (let k = 0; k < phrase.length; k++) {
        if (usedIndices.has(i + k)) {
          positionUsed = true;
          break;
        }
      }
      if (positionUsed) continue;

      let match = true;
      for (let j = 0; j < phrase.length; j++) {
        if (tokens[i + j] !== phrase[j]) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  };

  const convertLLMAlignments = (
    llmAlignments: Alignment[],
    sourceText: string,
    targetText: string
  ): { sourceTokens: string[]; targetTokens: string[]; alignments: VisualAlignment[] } => {
    const sourceTokens = tokenize(sourceText);
    const targetTokens = tokenize(targetText);
    const visualAlignments: VisualAlignment[] = [];
    const usedSourceIndices = new Set<number>();
    const usedTargetIndices = new Set<number>();

    llmAlignments.forEach((alignment, groupIdx) => {
      const sourcePhrase = tokenize(alignment.source);
      const targetPhrase = tokenize(alignment.target);

      const srcStartIdx = findNextPhraseIndex(sourceTokens, sourcePhrase, usedSourceIndices);
      const tgtStartIdx = findNextPhraseIndex(targetTokens, targetPhrase, usedTargetIndices);

      if (srcStartIdx !== -1 && tgtStartIdx !== -1) {
        for (let i = 0; i < sourcePhrase.length; i++) {
          usedSourceIndices.add(srcStartIdx + i);
        }
        for (let j = 0; j < targetPhrase.length; j++) {
          usedTargetIndices.add(tgtStartIdx + j);
        }

        const isMultiWord = sourcePhrase.length > 1 || targetPhrase.length > 1;

        for (let i = 0; i < sourcePhrase.length; i++) {
          for (let j = 0; j < targetPhrase.length; j++) {
            visualAlignments.push({
              source: srcStartIdx + i,
              target: tgtStartIdx + j,
              sourceToken: sourceTokens[srcStartIdx + i],
              targetToken: targetTokens[tgtStartIdx + j],
              score: 1.0,
              groupId: groupIdx,
              isPhrase: isMultiWord,
            });
          }
        }
      }
    });

    return { sourceTokens, targetTokens, alignments: visualAlignments };
  };

  const translateText = async (
    text: string,
    from: string,
    to: string
  ): Promise<TranslationResult> => {
    log(`📤 Sending request to server (${CONFIG.model})...`);

    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceText: text,
        sourceLang: from,
        targetLang: to,
        model: CONFIG.model,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const content = data.choices[0].message.content.trim();
    let cleanContent = content;
    if (content.includes('```')) {
      cleanContent = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    }

    const result = JSON.parse(cleanContent);

    if (result.translation && result.alignments) {
      log(`✅ Successfully parsed JSON with ${result.alignments.length} alignments`, 'success');
      return result;
    } else {
      throw new Error('Invalid JSON structure - missing translation or alignments');
    }
  };

  const translateAndAlign = async () => {
    if (!sourceText.trim()) {
      log('❌ Please enter source text', 'error');
      return;
    }

    const sentences = splitIntoSentences(sourceText);
    log(`📝 Split text into ${sentences.length} sentence(s)`);
    log(`🚀 Starting translation: ${sourceLang} → ${targetLang}`);

    setVisualizations([]);
    setTargetText('');

    const allTranslations: string[] = [];
    const newVisualizations: Array<{ id: string; sourceTokens: string[]; targetTokens: string[]; alignments: VisualAlignment[] }> = [];

    try {
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        log(`\n📍 Processing sentence ${i + 1}/${sentences.length}: "${sentence}"`);

        const result = await translateText(sentence, sourceLang, targetLang);

        if (!result.translation || !result.alignments) {
          throw new Error(`LLM did not return proper format for sentence ${i + 1}.`);
        }

        const translation = result.translation;
        allTranslations.push(translation);

        const converted = convertLLMAlignments(result.alignments, sentence, translation);
        
        newVisualizations.push({
          id: `alignment-container-${i}`,
          sourceTokens: converted.sourceTokens,
          targetTokens: converted.targetTokens,
          alignments: converted.alignments,
        });
      }

      setTargetText(allTranslations.join(' '));
      setVisualizations(newVisualizations);
      log(`\n✅ All ${sentences.length} sentence(s) processed successfully!`, 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTargetText(`Error: ${message}`);
      log(`❌ Error: ${message}`, 'error');
    }
  };

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(targetText);
    setTargetText(sourceText);
    log('🔄 Swapped languages and text');
  };

  useEffect(() => {
    setMounted(true);
    
    const params = new URLSearchParams(window.location.search);
    const text = params.get('text');
    const from = params.get('from');
    const to = params.get('to');

    if (text) {
      setSourceText(text);
      if (from) setSourceLang(from);
      if (to) setTargetLang(to);
    } else {
      const randomSentence = CONFIG.dutchSentences[Math.floor(Math.random() * CONFIG.dutchSentences.length)];
      setSourceText(randomSentence);
    }

    if (window.innerWidth <= 480) {
      setLogVisible(false);
    }
  }, []);

  useEffect(() => {
    visualizations.forEach((viz) => {
      const container = visualizationRefs.current[viz.id];
      if (container) {
        visualizeAlignment(viz.sourceTokens, viz.targetTokens, viz.alignments, container);
      }
    });
  }, [visualizations]);

  const visualizeAlignment = (
    sourceTokens: string[],
    targetTokens: string[],
    alignments: VisualAlignment[],
    container: HTMLDivElement
  ) => {
    const sourceLane = container.querySelector('.source-lane');
    const targetLane = container.querySelector('.target-lane');

    if (!sourceLane || !targetLane) return;

    sourceLane.innerHTML = '';
    targetLane.innerHTML = '';

    const oldSvg = container.querySelector('.svg-overlay');
    if (oldSvg) oldSvg.remove();

    const sourceElements: HTMLDivElement[] = [];
    const targetElements: HTMLDivElement[] = [];

    sourceTokens.forEach((token, idx) => {
      const el = document.createElement('div');
      el.className = 'token';
      el.textContent = token;
      el.dataset.index = String(idx);
      sourceLane.appendChild(el);
      sourceElements.push(el);
    });

    targetTokens.forEach((token, idx) => {
      const el = document.createElement('div');
      el.className = 'token';
      el.textContent = token;
      el.dataset.index = String(idx);
      targetLane.appendChild(el);
      targetElements.push(el);
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('svg-overlay');
    container.insertBefore(svg, sourceLane);

    setTimeout(() => {
      const containerRect = container.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const scaledWidth = containerRect.width * scale;
      const scaledHeight = containerRect.height * scale;

      svg.setAttribute('width', String(scaledWidth));
      svg.setAttribute('height', String(scaledHeight));
      svg.setAttribute('viewBox', `0 0 ${scaledWidth} ${scaledHeight}`);
      svg.style.width = `${containerRect.width}px`;
      svg.style.height = `${containerRect.height}px`;

      const groupedAlignments: { [key: number]: VisualAlignment[] } = {};
      alignments.forEach((alignment) => {
        const groupId = alignment.groupId ?? alignment.source;
        if (!groupedAlignments[groupId]) {
          groupedAlignments[groupId] = [];
        }
        groupedAlignments[groupId].push(alignment);
      });

      Object.entries(groupedAlignments).forEach(([, group], colorIdx) => {
        const color = getColor(colorIdx);
        const srcIndices = [...new Set(group.map((a) => a.source))];
        const tgtIndices = [...new Set(group.map((a) => a.target))];

        const srcElements = srcIndices.map((i) => sourceElements[i]).filter((el) => el);
        const tgtElements = tgtIndices.map((i) => targetElements[i]).filter((el) => el);

        if (srcElements.length === 0 || tgtElements.length === 0) return;

        srcElements.forEach((el) => (el.style.borderColor = color));
        tgtElements.forEach((el) => (el.style.borderColor = color));

        const srcEl = srcElements[0];
        const tgtEl = tgtElements[0];

        const srcRect = srcEl.getBoundingClientRect();
        const tgtRect = tgtEl.getBoundingClientRect();

        const x1 = (srcRect.left + srcRect.width / 2 - containerRect.left) * scale;
        const y1 = (srcRect.bottom - containerRect.top) * scale;
        const x2 = (tgtRect.left + tgtRect.width / 2 - containerRect.left) * scale;
        const y2 = (tgtRect.top - containerRect.top) * scale;

        const distance = Math.abs(y2 - y1);
        const controlOffset = distance * 0.5;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${y1 + controlOffset}, ${x2} ${y2 - controlOffset}, ${x2} ${y2}`);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', String(2.5 * scale));
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.8');
        svg.appendChild(path);

        const highlightPair = () => {
          srcEl.classList.add('highlight');
          tgtEl.classList.add('highlight');
          path.setAttribute('stroke-width', String(4 * scale));
          path.setAttribute('opacity', '1');
        };

        const unhighlightPair = () => {
          srcEl.classList.remove('highlight');
          tgtEl.classList.remove('highlight');
          path.setAttribute('stroke-width', String(2.5 * scale));
          path.setAttribute('opacity', '0.8');
        };

        srcEl.addEventListener('mouseenter', highlightPair);
        srcEl.addEventListener('mouseleave', unhighlightPair);
        tgtEl.addEventListener('mouseenter', highlightPair);
        tgtEl.addEventListener('mouseleave', unhighlightPair);
      });
    }, 200);
  };

  const getColor = (index: number): string => {
    const goldenAngle = 137.508;
    const hue = (index * goldenAngle) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  };

  if (!mounted) {
    return (
      <div>
        <h1>🔗 Word Mapper</h1>
        <div className="container">
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>🔗 Word Mapper</h1>

      <div className="container">
        <div className="visualization-section">
          <div className="card">
            <div style={{ display: 'flex', gap: 'var(--padding-md)', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label htmlFor="sourceText">Source Text</label>
                <textarea
                  id="sourceText"
                  placeholder="Enter text to translate..."
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  style={{ minHeight: '80px' }}
                />
              </div>
              <div className="button-group" style={{ marginBottom: 0, minWidth: '300px' }}>
                <button onClick={translateAndAlign}>🚀 Translate & Align</button>
              </div>
            </div>
          </div>
        </div>

        <div className="visualization-section">
          {visualizations.map((viz, i) => (
            <div key={viz.id} className="card" style={{ marginBottom: 'var(--padding-lg)' }}>
              <h2>Sentence {i + 1}</h2>
              <div
                className="alignment-container"
                ref={(el) => {
                  visualizationRefs.current[viz.id] = el;
                }}
              >
                <div className="token-lane source-lane"></div>
                <div className="token-lane target-lane"></div>
              </div>
            </div>
          ))}
        </div>

        <div className="controls-section">
          <div className="card">
            <h2>Settings</h2>
            <div className="language-row">
              <div className="form-group">
                <label htmlFor="sourceLang">Source Language</label>
                <select id="sourceLang" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                  <option value="Dutch">Dutch</option>
                  <option value="English">English</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Spanish">Spanish</option>
                </select>
              </div>
              <button className="secondary" onClick={swapLanguages} style={{ flex: 0, padding: '10px 16px' }}>
                ⇄
              </button>
              <div className="form-group">
                <label htmlFor="targetLang">Target Language</label>
                <select id="targetLang" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                  <option value="Dutch">Dutch</option>
                  <option value="English">English</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Spanish">Spanish</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Translation Result</h2>
            <div className="form-group">
              <label htmlFor="targetText">Translated Text</label>
              <textarea
                id="targetText"
                placeholder="Translation will appear here..."
                value={targetText}
                readOnly
                style={{ minHeight: '150px' }}
              />
            </div>

            <div className="log-container">
              <div className="log-header" onClick={() => setLogVisible(!logVisible)}>
                <label style={{ margin: 0, cursor: 'pointer' }}>Activity Log</label>
                <span className="log-toggle">{logVisible ? '▼ Hide' : '▶ Show'}</span>
              </div>
              <div className={`log-area ${logVisible ? 'visible' : ''}`}>
                {logs.map((log, i) => (
                  <div key={i} className={`log-entry ${log.type}`}>
                    <span className="log-timestamp">[{log.timestamp}]</span> {log.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
