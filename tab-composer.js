(() => {
  'use strict';

  const tunings = {
    guitar: [
      { label: 'e', midi: 64 }, { label: 'B', midi: 59 }, { label: 'G', midi: 55 },
      { label: 'D', midi: 50 }, { label: 'A', midi: 45 }, { label: 'E', midi: 40 }
    ],
    bass: [
      { label: 'G', midi: 43 }, { label: 'D', midi: 38 }, { label: 'A', midi: 33 }, { label: 'E', midi: 28 }
    ]
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function parseAscii(text, stringCount, steps) {
    const lines = String(text || '').split(/\r?\n/).filter(line => line.includes('|'));
    const notes = [];
    lines.slice(0, stringCount).forEach((line, string) => {
      const body = line.slice(line.indexOf('|') + 1);
      const matches = [...body.matchAll(/\d+/g)];
      matches.forEach(match => {
        const step = clamp(Math.round(match.index / 3), 0, steps - 1);
        let duration = 1;
        const after = body.slice(match.index + match[0].length);
        const sustain = after.match(/^[~-]+/);
        if (sustain) duration = clamp(1 + Math.floor((sustain[0].match(/~/g) || []).length / 3), 1, steps - step);
        notes.push({ string, step, fret: clamp(+match[0], 0, 36), duration });
      });
    });
    return notes;
  }

  function toAscii(notes, tuning, steps) {
    return tuning.map((string, stringIndex) => {
      const cells = Array.from({ length: steps }, () => '---');
      notes.filter(note => note.string === stringIndex).forEach(note => {
        const fret = String(note.fret);
        cells[note.step] = fret.length === 1 ? `-${fret}-` : `${fret}-`.slice(0, 3);
        for (let i = 1; i < note.duration && note.step + i < steps; i++) cells[note.step + i] = '~~~';
      });
      return `${string.label}|${cells.join('')}|`;
    }).join('\n');
  }

  function mount({ element, textarea, instrument, sequence, bpm, onChange }) {
    const tuning = tunings[instrument] || tunings.guitar;
    let steps = Math.max(16, ...(Array.isArray(sequence) ? sequence.map(note => (+note.step || 0) + (+note.duration || 1)) : [16]));
    steps = Math.ceil(steps / 4) * 4;
    let notes = Array.isArray(sequence) && sequence.length
      ? sequence.map(note => ({
          string: clamp(+note.string || 0, 0, tuning.length - 1),
          step: clamp(+note.step || 0, 0, steps - 1),
          fret: clamp(+note.fret || 0, 0, 36),
          duration: clamp(+note.duration || 1, 1, steps - (+note.step || 0))
        }))
      : parseAscii(textarea.value, tuning.length, steps);
    let selected = -1;
    let audioContext = null;
    let playbackTimers = [];
    let playing = false;
    let drag = null;

    element.className = 'tab-composer';
    element.innerHTML = `
      <div class="composer-heading">
        <div><span class="eyebrow">VISUAL TAB COMPOSER</span><strong>Build your lick</strong></div>
        <div class="composer-actions">
          <button class="btn" data-composer-play>▶ Play lick</button>
          <button class="btn secondary" data-composer-stop disabled>Stop</button>
        </div>
      </div>
      <div class="composer-toolbar">
        <label>Fret <input data-composer-fret type="number" min="0" max="36" value="5"></label>
        <button class="btn secondary" data-composer-add>Add 4 beats</button>
        <button class="btn secondary" data-composer-delete disabled>Delete note</button>
        <button class="btn secondary" data-composer-clear>Clear</button>
      </div>
      <div class="composer-scroll"><div class="composer-grid" data-composer-grid></div></div>
      <p class="composer-help">Click an empty beat to add a note. Drag a note to move it; drag its right handle to change its length. Double-click to delete. Each column is one rhythm division.</p>`;

    const grid = element.querySelector('[data-composer-grid]');
    const fretInput = element.querySelector('[data-composer-fret]');
    const deleteButton = element.querySelector('[data-composer-delete]');
    const playButton = element.querySelector('[data-composer-play]');
    const stopButton = element.querySelector('[data-composer-stop]');

    function emit() {
      notes.sort((a, b) => a.step - b.step || a.string - b.string);
      const text = toAscii(notes, tuning, steps);
      textarea.value = text;
      onChange(notes.map(note => ({ ...note })), text);
    }

    function render() {
      grid.style.setProperty('--composer-steps', steps);
      grid.innerHTML = `<div class="composer-corner">String</div>${Array.from({ length: steps }, (_, step) => `<div class="composer-beat${step % 4 === 0 ? ' bar' : ''}">${step % 4 + 1}</div>`).join('')}`;
      tuning.forEach((string, stringIndex) => {
        const label = document.createElement('div');
        label.className = 'composer-string-label';
        label.textContent = string.label;
        grid.append(label);
        for (let step = 0; step < steps; step++) {
          const cell = document.createElement('button');
          cell.className = `composer-cell${step % 4 === 0 ? ' bar' : ''}`;
          cell.type = 'button';
          cell.dataset.string = stringIndex;
          cell.dataset.step = step;
          cell.setAttribute('aria-label', `${string.label} string, beat ${step + 1}`);
          grid.append(cell);
        }
        notes.forEach((note, index) => {
          if (note.string !== stringIndex) return;
          const chip = document.createElement('button');
          chip.className = `composer-note${index === selected ? ' selected' : ''}`;
          chip.type = 'button';
          chip.dataset.note = index;
          chip.style.gridColumn = `${note.step + 2} / span ${note.duration}`;
          chip.style.gridRow = `${stringIndex + 2}`;
          chip.innerHTML = `<span>${note.fret}</span><i data-resize aria-hidden="true"></i>`;
          chip.setAttribute('aria-label', `Fret ${note.fret}, ${string.label} string, beat ${note.step + 1}, length ${note.duration}`);
          grid.append(chip);
        });
      });
      deleteButton.disabled = selected < 0;
    }

    function select(index) {
      selected = index;
      if (notes[index]) fretInput.value = notes[index].fret;
      grid.querySelectorAll('[data-note]').forEach(chip => chip.classList.toggle('selected', +chip.dataset.note === index));
      deleteButton.disabled = selected < 0;
    }

    grid.addEventListener('click', event => {
      if (drag) return;
      const note = event.target.closest('[data-note]');
      if (note) return select(+note.dataset.note);
      const cell = event.target.closest('.composer-cell');
      if (!cell) return;
      const string = +cell.dataset.string, step = +cell.dataset.step;
      const existing = notes.findIndex(item => item.string === string && step >= item.step && step < item.step + item.duration);
      if (existing >= 0) return select(existing);
      notes.push({ string, step, fret: clamp(+fretInput.value || 0, 0, 36), duration: 1 });
      selected = notes.length - 1;
      emit(); render();
    });

    grid.addEventListener('dblclick', event => {
      const note = event.target.closest('[data-note]');
      if (!note) return;
      notes.splice(+note.dataset.note, 1); selected = -1; emit(); render();
    });

    grid.addEventListener('pointerdown', event => {
      const chip = event.target.closest('[data-note]');
      if (!chip) return;
      event.preventDefault();
      const index = +chip.dataset.note;
      select(index);
      drag = {
        index,
        resize: !!event.target.closest('[data-resize]'),
        startX: event.clientX,
        startY: event.clientY,
        note: { ...notes[index] },
        cellWidth: grid.querySelector('.composer-cell').getBoundingClientRect().width,
        rowHeight: grid.querySelector('.composer-cell').getBoundingClientRect().height
      };
      chip.setPointerCapture(event.pointerId);
    });

    grid.addEventListener('pointermove', event => {
      if (!drag) return;
      const deltaSteps = Math.round((event.clientX - drag.startX) / drag.cellWidth);
      if (drag.resize) notes[drag.index].duration = clamp(drag.note.duration + deltaSteps, 1, steps - notes[drag.index].step);
      else {
        notes[drag.index].step = clamp(drag.note.step + deltaSteps, 0, steps - notes[drag.index].duration);
        notes[drag.index].string = clamp(drag.note.string + Math.round((event.clientY - drag.startY) / drag.rowHeight), 0, tuning.length - 1);
      }
      const chip = grid.querySelector(`[data-note="${drag.index}"]`);
      if (chip) {
        chip.style.gridColumn = `${notes[drag.index].step + 2} / span ${notes[drag.index].duration}`;
        chip.style.gridRow = `${notes[drag.index].string + 2}`;
      }
    });

    grid.addEventListener('pointerup', () => { if (drag) { drag = null; emit(); render(); } });
    grid.addEventListener('pointercancel', () => { drag = null; render(); });

    fretInput.addEventListener('change', () => {
      fretInput.value = clamp(+fretInput.value || 0, 0, 36);
      if (selected >= 0) { notes[selected].fret = +fretInput.value; emit(); render(); }
    });
    deleteButton.onclick = () => { if (selected >= 0) { notes.splice(selected, 1); selected = -1; emit(); render(); } };
    element.querySelector('[data-composer-add]').onclick = () => { steps += 4; emit(); render(); };
    element.querySelector('[data-composer-clear]').onclick = () => { if (!notes.length) return; notes = []; selected = -1; emit(); render(); };

    function pluck(midi, when, length) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), when);
      filter.type = 'lowpass'; filter.frequency.value = instrument === 'bass' ? 1100 : 2400;
      gain.gain.setValueAtTime(.0001, when);
      gain.gain.exponentialRampToValueAtTime(.2, when + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, when + Math.max(.12, length * .92));
      oscillator.connect(filter).connect(gain).connect(audioContext.destination);
      oscillator.start(when); oscillator.stop(when + Math.max(.15, length));
    }

    function stop() {
      playbackTimers.forEach(clearTimeout); playbackTimers = []; playing = false;
      playButton.disabled = false; stopButton.disabled = true;
      grid.querySelectorAll('.playing').forEach(item => item.classList.remove('playing'));
    }

    playButton.onclick = () => {
      if (!notes.length) return;
      stop(); playing = true; playButton.disabled = true; stopButton.disabled = false;
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume();
      const secondsPerStep = 60 / clamp(+bpm() || 80, 20, 300) * .5;
      const start = audioContext.currentTime + .06;
      notes.forEach((note, index) => {
        pluck(tuning[note.string].midi + note.fret, start + note.step * secondsPerStep, note.duration * secondsPerStep);
        playbackTimers.push(setTimeout(() => {
          const chip = grid.querySelector(`[data-note="${index}"]`); if (chip) chip.classList.add('playing');
        }, note.step * secondsPerStep * 1000));
        playbackTimers.push(setTimeout(() => {
          const chip = grid.querySelector(`[data-note="${index}"]`); if (chip) chip.classList.remove('playing');
        }, (note.step + note.duration) * secondsPerStep * 1000));
      });
      const endStep = Math.max(...notes.map(note => note.step + note.duration));
      playbackTimers.push(setTimeout(stop, endStep * secondsPerStep * 1000 + 100));
    };
    stopButton.onclick = stop;

    textarea.addEventListener('change', () => {
      notes = parseAscii(textarea.value, tuning.length, steps); selected = -1; emit(); render();
    });

    render();
    if (!textarea.value && notes.length) emit();
  }

  window.TabComposer = { mount };
})();
