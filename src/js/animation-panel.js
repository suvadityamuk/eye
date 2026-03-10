/**
 * animation-panel.js — Animation playback controls
 */
export class AnimationPanel {
    constructor(sceneManager) {
        this.sm = sceneManager;
        this.currentAction = null;
        this.isPlaying = false;
        this.isLooping = true;
        this._rafId = null;

        this._bindElements();
        this._bindEvents();
    }

    _bindElements() {
        this.btnPlay = document.getElementById('btn-anim-play');
        this.btnPause = document.getElementById('btn-anim-pause');
        this.btnStop = document.getElementById('btn-anim-stop');
        this.btnLoop = document.getElementById('btn-anim-loop');
        this.clipSelect = document.getElementById('anim-clip-select');
        this.timeline = document.getElementById('anim-timeline');
        this.timeCurrent = document.getElementById('anim-time-current');
        this.timeTotal = document.getElementById('anim-time-total');
        this.speedSlider = document.getElementById('anim-speed');
        this.speedVal = document.getElementById('anim-speed-val');
    }

    _bindEvents() {
        this.btnPlay.addEventListener('click', () => this.play());
        this.btnPause.addEventListener('click', () => this.pause());
        this.btnStop.addEventListener('click', () => this.stop());
        this.btnLoop.addEventListener('click', () => this.toggleLoop());

        this.clipSelect.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value);
            if (!isNaN(idx)) this.selectClip(idx);
        });

        this.speedSlider.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            this.speedVal.textContent = speed.toFixed(1) + 'x';
            if (this.currentAction) {
                this.currentAction.timeScale = speed;
            }
        });

        this.timeline.addEventListener('input', (e) => {
            if (this.currentAction) {
                const clip = this.currentAction.getClip();
                const time = (parseFloat(e.target.value) / 100) * clip.duration;
                this.sm.animationMixer.setTime(time);
                this._updateTimeDisplay(time, clip.duration);
            }
        });
    }

    /** Refresh when a new model is loaded */
    refresh() {
        this.stop();
        this.currentAction = null;
        const clips = this.sm.animationClips;

        // Update clip selector
        this.clipSelect.innerHTML = '';
        if (clips.length === 0) {
            this.clipSelect.innerHTML = '<option value="">NO ANIMATIONS</option>';
            this._setControlsEnabled(false);
            return;
        }

        clips.forEach((clip, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = clip.name || `Clip ${i + 1}`;
            this.clipSelect.appendChild(opt);
        });

        this._setControlsEnabled(true);
        this.selectClip(0);
    }

    selectClip(index) {
        if (!this.sm.animationMixer) return;
        const clip = this.sm.animationClips[index];
        if (!clip) return;

        // Stop current action
        if (this.currentAction) {
            this.currentAction.stop();
        }

        this.currentAction = this.sm.animationMixer.clipAction(clip);
        this.currentAction.loop = this.isLooping ? 2 : 0; // LoopRepeat = 2, LoopOnce = 0
        this.currentAction.clampWhenFinished = true;
        this.currentAction.timeScale = parseFloat(this.speedSlider.value);

        this.timeline.max = 100;
        this.timeTotal.textContent = this._formatTime(clip.duration);
        this._updateTimeDisplay(0, clip.duration);
    }

    play() {
        if (!this.currentAction) return;
        this.currentAction.paused = false;
        this.currentAction.play();
        this.isPlaying = true;
        this.btnPlay.style.display = 'none';
        this.btnPause.style.display = '';
        this._startTimelineUpdate();
    }

    pause() {
        if (!this.currentAction) return;
        this.currentAction.paused = true;
        this.isPlaying = false;
        this.btnPlay.style.display = '';
        this.btnPause.style.display = 'none';
        this._stopTimelineUpdate();
    }

    stop() {
        if (this.currentAction) {
            this.currentAction.stop();
            this.currentAction.reset();
        }
        this.isPlaying = false;
        this.btnPlay.style.display = '';
        this.btnPause.style.display = 'none';
        this.timeline.value = 0;
        this.timeCurrent.textContent = '0:00.0';
        this._stopTimelineUpdate();
    }

    toggleLoop() {
        this.isLooping = !this.isLooping;
        this.btnLoop.classList.toggle('active', this.isLooping);
        if (this.currentAction) {
            this.currentAction.loop = this.isLooping ? 2 : 0;
        }
    }

    _setControlsEnabled(enabled) {
        [this.btnPlay, this.btnPause, this.btnStop, this.btnLoop,
        this.clipSelect, this.timeline, this.speedSlider].forEach(el => {
            el.disabled = !enabled;
        });
    }

    _startTimelineUpdate() {
        this._stopTimelineUpdate();
        const update = () => {
            if (!this.isPlaying || !this.currentAction) return;
            const clip = this.currentAction.getClip();
            const time = this.currentAction.time % clip.duration;
            const progress = (time / clip.duration) * 100;
            this.timeline.value = progress;
            this._updateTimeDisplay(time, clip.duration);
            this._rafId = requestAnimationFrame(update);
        };
        this._rafId = requestAnimationFrame(update);
    }

    _stopTimelineUpdate() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    _updateTimeDisplay(current, total) {
        this.timeCurrent.textContent = this._formatTime(current);
        this.timeTotal.textContent = this._formatTime(total);
    }

    _formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
    }

    clear() {
        this.stop();
        this.currentAction = null;
        this.clipSelect.innerHTML = '<option value="">NO ANIMATIONS</option>';
        this._setControlsEnabled(false);
    }
}
