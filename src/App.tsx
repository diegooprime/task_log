import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getTasks, saveTasks, completeTask, hideWindow, getHotkey, setHotkey, TaskState, Task, Note } from './store';
import './App.css';

// Debounce helper
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Helper to render text with clickable links
const renderTextWithLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    // Use a fresh regex test without global state issues
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="task-link"
        >
          {part.length > 40 ? part.substring(0, 40) + '...' : part}
        </a>
      );
    }
    return part;
  });
};

type Pane = 'current' | 'shelf';

const MAX_CURRENT = 10;
const MAX_HISTORY = 50;

// Convert keyboard event to hotkey string
function eventToHotkeyString(e: KeyboardEvent): string | null {
  const parts: string[] = [];

  // Must have at least one modifier for a global hotkey
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    return null;
  }

  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Get the key
  let key = e.key;

  // Skip if only modifier keys are pressed
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
    return null;
  }

  // Normalize key names
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';

  parts.push(key);
  return parts.join('+');
}

function App() {
  const [tasks, setTasks] = useState<TaskState>({ current: [], shelf: [] });
  const [history, setHistory] = useState<TaskState[]>([]);
  const [activePane, setActivePane] = useState<Pane>('current');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [shakePane, setShakePane] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState(0);
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentHotkey, setCurrentHotkey] = useState('');
  const [pendingHotkey, setPendingHotkey] = useState<string | null>(null);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const tasksRef = useRef<TaskState>(tasks);

  // Keep ref in sync with state
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Debounced save to reduce disk writes with visual feedback
  const debouncedSave = useMemo(
    () => debounce((state: TaskState) => {
      saveTasks(state).then(() => {
        setSaveIndicator(true);
        setTimeout(() => setSaveIndicator(false), 600);
      });
    }, 300),
    []
  );

  const currentList = activePane === 'current' ? tasks.current : tasks.shelf;
  const otherList = activePane === 'current' ? tasks.shelf : tasks.current;

  useEffect(() => {
    getTasks().then(setTasks);
    getHotkey().then(setCurrentHotkey);
  }, []);

  useEffect(() => {
    if (editingIndex !== null || isCreating) {
      inputRef.current?.focus();
    }
  }, [editingIndex, isCreating]);

  useEffect(() => {
    if (editingNoteIndex !== null || isCreatingNote) {
      noteInputRef.current?.focus();
    }
  }, [editingNoteIndex, isCreatingNote]);

  // Reset selected note index when expanding a different task
  useEffect(() => {
    if (expandedIndex !== null) {
      setSelectedNoteIndex(0);
    }
  }, [expandedIndex]);

  // Reload tasks when window regains focus to ensure fresh state
  useEffect(() => {
    const handleWindowFocus = () => {
      getTasks().then((loadedTasks) => {
        setTasks(loadedTasks);
        // Clear history since we're loading fresh state from disk
        setHistory([]);
      });
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  // Handle hotkey capture in settings mode
  useEffect(() => {
    if (!showSettings) return;

    const handleHotkeyCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setShowSettings(false);
        setPendingHotkey(null);
        setHotkeyError(null);
        return;
      }

      const hotkeyStr = eventToHotkeyString(e);
      if (hotkeyStr) {
        setPendingHotkey(hotkeyStr);
        setHotkeyError(null);
      }
    };

    window.addEventListener('keydown', handleHotkeyCapture);
    return () => window.removeEventListener('keydown', handleHotkeyCapture);
  }, [showSettings]);

  const saveHotkey = async () => {
    if (!pendingHotkey) return;
    try {
      await setHotkey(pendingHotkey);
      setCurrentHotkey(pendingHotkey);
      setPendingHotkey(null);
      setShowSettings(false);
      setHotkeyError(null);
    } catch (err) {
      setHotkeyError(err instanceof Error ? err.message : 'Failed to set hotkey');
    }
  };

  const pushHistory = useCallback((state: TaskState) => {
    setHistory(prev => {
      const newHistory = [...prev, state];
      if (newHistory.length > MAX_HISTORY) {
        return newHistory.slice(-MAX_HISTORY);
      }
      return newHistory;
    });
  }, []);

  const persist = useCallback((newState: TaskState) => {
    // Use ref to get current state, avoiding stale closure
    pushHistory(tasksRef.current);
    setTasks(newState);
    debouncedSave(newState);
  }, [pushHistory, debouncedSave]);

  const undo = useCallback(async () => {
    if (history.length > 0) {
      const previousState = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1));
      setTasks(previousState);
      await saveTasks(previousState);
      // Adjust selected index if needed
      const list = activePane === 'current' ? previousState.current : previousState.shelf;
      setSelectedIndex(prev => Math.min(prev, Math.max(0, list.length - 1)));
      setExpandedIndex(null);
    }
  }, [history, activePane]);

  const clampIndex = useCallback((idx: number, list: Task[]) => {
    if (list.length === 0) return 0;
    return Math.max(0, Math.min(idx, list.length - 1));
  }, []);

  const clampNoteIndex = useCallback((idx: number, notes: Note[]) => {
    if (notes.length === 0) return 0;
    return Math.max(0, Math.min(idx, notes.length - 1));
  }, []);

  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    // Settings mode handles its own keys
    if (showSettings) return;

    // If editing task or note, only handle edit-specific keys
    if (editingIndex !== null || isCreating || editingNoteIndex !== null || isCreatingNote) {
      if (e.key === 'Escape') {
        setEditingIndex(null);
        setIsCreating(false);
        setEditingNoteIndex(null);
        setIsCreatingNote(false);
        setEditValue('');
      }
      return; // Let the input handle other keys
    }

    const currentTask = expandedIndex !== null ? currentList[expandedIndex] : null;
    const currentNotes = currentTask?.notes || [];

    // Navigation and actions
    switch (e.key) {
      case 'j':
        if (expandedIndex !== null) {
          // Navigate notes within expanded task
          setSelectedNoteIndex(prev => clampNoteIndex(prev + 1, currentNotes));
        } else {
          setSelectedIndex(prev => clampIndex(prev + 1, currentList));
        }
        break;
      case 'k':
        if (expandedIndex !== null) {
          // Navigate notes within expanded task
          setSelectedNoteIndex(prev => clampNoteIndex(prev - 1, currentNotes));
        } else {
          setSelectedIndex(prev => clampIndex(prev - 1, currentList));
        }
        break;
      case 'J':
        if (expandedIndex !== null) {
          // Move note down within expanded task
          if (currentNotes.length > 1 && selectedNoteIndex < currentNotes.length - 1) {
            const newNotes = [...currentNotes];
            [newNotes[selectedNoteIndex], newNotes[selectedNoteIndex + 1]] = 
              [newNotes[selectedNoteIndex + 1], newNotes[selectedNoteIndex]];
            const newList = [...currentList];
            newList[expandedIndex] = { ...newList[expandedIndex], notes: newNotes };
            const newState = activePane === 'current' 
              ? { ...tasks, current: newList }
              : { ...tasks, shelf: newList };
            await persist(newState);
            setSelectedNoteIndex(selectedNoteIndex + 1);
          }
        } else {
          // Move task down
          if (currentList.length > 1 && selectedIndex < currentList.length - 1) {
            const newList = [...currentList];
            [newList[selectedIndex], newList[selectedIndex + 1]] = 
              [newList[selectedIndex + 1], newList[selectedIndex]];
            const newState = activePane === 'current' 
              ? { ...tasks, current: newList }
              : { ...tasks, shelf: newList };
            await persist(newState);
            setSelectedIndex(selectedIndex + 1);
          }
        }
        break;
      case 'K':
        if (expandedIndex !== null) {
          // Move note up within expanded task
          if (currentNotes.length > 1 && selectedNoteIndex > 0) {
            const newNotes = [...currentNotes];
            [newNotes[selectedNoteIndex], newNotes[selectedNoteIndex - 1]] = 
              [newNotes[selectedNoteIndex - 1], newNotes[selectedNoteIndex]];
            const newList = [...currentList];
            newList[expandedIndex] = { ...newList[expandedIndex], notes: newNotes };
            const newState = activePane === 'current' 
              ? { ...tasks, current: newList }
              : { ...tasks, shelf: newList };
            await persist(newState);
            setSelectedNoteIndex(selectedNoteIndex - 1);
          }
        } else {
          // Move task up
          if (currentList.length > 1 && selectedIndex > 0) {
            const newList = [...currentList];
            [newList[selectedIndex], newList[selectedIndex - 1]] = 
              [newList[selectedIndex - 1], newList[selectedIndex]];
            const newState = activePane === 'current' 
              ? { ...tasks, current: newList }
              : { ...tasks, shelf: newList };
            await persist(newState);
            setSelectedIndex(selectedIndex - 1);
          }
        }
        break;
      case 'Tab':
        e.preventDefault();
        // Always close expanded view when switching panes
        setExpandedIndex(null);
        // Toggle between panes
        const newPane: Pane = activePane === 'current' ? 'shelf' : 'current';
        const newList = newPane === 'current' ? tasks.current : tasks.shelf;
        setActivePane(newPane);
        setSelectedIndex(clampIndex(selectedIndex, newList));
        break;
      case 'a':
        if (expandedIndex !== null) {
          // Edit selected note
          const safeNoteIdx = clampNoteIndex(selectedNoteIndex, currentNotes);
          if (currentNotes.length > 0 && currentNotes[safeNoteIdx]) {
            setSelectedNoteIndex(safeNoteIdx);
            setEditingNoteIndex(safeNoteIdx);
            setEditValue(currentNotes[safeNoteIdx].text);
          } else {
            // No notes yet, create one
            setIsCreatingNote(true);
            setEditValue('');
          }
        } else if (currentList.length > 0) {
          const safeIdx = clampIndex(selectedIndex, currentList);
          setSelectedIndex(safeIdx);
          setEditingIndex(safeIdx);
          setEditValue(currentList[safeIdx].text);
        }
        break;
      case 'o':
        e.preventDefault();
        if (expandedIndex !== null) {
          // In expanded view, create a new note
          setIsCreatingNote(true);
          setEditValue('');
        } else {
          setIsCreating(true);
          setEditValue('');
        }
        break;
      case 'u':
        // Undo last action
        e.preventDefault();
        await undo();
        break;
      case 'Enter':
        if (e.metaKey || e.ctrlKey) {
          // Cmd+Enter or Ctrl+Enter
          e.preventDefault();
          if (expandedIndex !== null && currentNotes.length > 0) {
            // Toggle completion of selected note (not the parent task)
            const safeNoteIdx = clampNoteIndex(selectedNoteIndex, currentNotes);
            if (currentNotes[safeNoteIdx]) {
              const newList = [...currentList];
              const newNotes = [...newList[expandedIndex].notes];
              newNotes[safeNoteIdx] = {
                ...newNotes[safeNoteIdx],
                completed: !newNotes[safeNoteIdx].completed
              };
              newList[expandedIndex] = { ...newList[expandedIndex], notes: newNotes };
              const newState = activePane === 'current'
                ? { ...tasks, current: newList }
                : { ...tasks, shelf: newList };
              persist(newState);
              setSelectedNoteIndex(safeNoteIdx);
            }
          } else if (currentList.length > 0) {
            // Complete the parent task (only when task itself is focused)
            // Capture values now to avoid stale closure in timeout
            const safeIdx = clampIndex(selectedIndex, currentList);
            const taskToComplete = currentList[safeIdx];
            const capturedIndex = safeIdx;
            const capturedPane = activePane;
            setFlashIndex(capturedIndex);

            setTimeout(async () => {
              await completeTask(taskToComplete);
              // Use ref to get fresh state
              const freshTasks = tasksRef.current;
              const freshList = capturedPane === 'current' ? freshTasks.current : freshTasks.shelf;
              const newList = freshList.filter((_, i) => i !== capturedIndex);
              const newState = capturedPane === 'current'
                ? { ...freshTasks, current: newList }
                : { ...freshTasks, shelf: newList };
              persist(newState);
              setSelectedIndex(clampIndex(capturedIndex, newList));
              setFlashIndex(null);
              setExpandedIndex(null);
            }, 150);
          }
        } else {
          // Toggle expanded view for selected task's notes
          if (currentList.length > 0) {
            if (expandedIndex === selectedIndex) {
              setExpandedIndex(null);
            } else {
              setExpandedIndex(selectedIndex);
            }
          }
        }
        break;
      case 'Backspace':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          if (expandedIndex !== null && currentNotes.length > 0) {
            // Delete selected note
            const safeNoteIdx = clampNoteIndex(selectedNoteIndex, currentNotes);
            const newNotes = currentNotes.filter((_, i) => i !== safeNoteIdx);
            const newList = [...currentList];
            newList[expandedIndex] = { ...newList[expandedIndex], notes: newNotes };
            const newState = activePane === 'current'
              ? { ...tasks, current: newList }
              : { ...tasks, shelf: newList };
            persist(newState);
            setSelectedNoteIndex(clampNoteIndex(safeNoteIdx, newNotes));
          } else if (currentList.length > 0) {
            // Delete task
            const safeIdx = clampIndex(selectedIndex, currentList);
            const newList = currentList.filter((_, i) => i !== safeIdx);
            const newState = activePane === 'current'
              ? { ...tasks, current: newList }
              : { ...tasks, shelf: newList };
            persist(newState);
            setSelectedIndex(clampIndex(safeIdx, newList));
            setExpandedIndex(null);
          }
        }
        break;
      case 'm':
        if (expandedIndex !== null) return;
        if (currentList.length > 0) {
          const safeIdx = clampIndex(selectedIndex, currentList);
          const task = currentList[safeIdx];

          // If moving from shelf to current, check capacity
          if (activePane === 'shelf' && tasks.current.length >= MAX_CURRENT) {
            setShakePane(true);
            setTimeout(() => setShakePane(false), 300);
            break;
          }

          const newCurrentList = currentList.filter((_, i) => i !== safeIdx);
          const newOtherList = [...otherList, task];

          const newState = activePane === 'current'
            ? { current: newCurrentList, shelf: newOtherList }
            : { current: newOtherList, shelf: newCurrentList };

          persist(newState);
          setSelectedIndex(clampIndex(safeIdx, newCurrentList));
        }
        break;
      case 'Escape':
        if (showHelp) {
          setShowHelp(false);
        } else if (expandedIndex !== null) {
          setExpandedIndex(null);
        } else {
          await hideWindow();
        }
        break;
      case '?':
        setShowHelp(prev => !prev);
        break;
      case 's':
        if (expandedIndex === null) {
          setShowSettings(true);
          setPendingHotkey(null);
          setHotkeyError(null);
        }
        break;
    }
  }, [activePane, currentList, otherList, selectedIndex, tasks, editingIndex, isCreating, persist, clampIndex, clampNoteIndex, expandedIndex, selectedNoteIndex, editingNoteIndex, isCreatingNote, undo, showHelp, showSettings]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleEditSubmit = async () => {
    if (editingIndex !== null) {
      if (editValue.trim()) {
        const newList = [...currentList];
        newList[editingIndex] = { ...newList[editingIndex], text: editValue.trim() };
        const newState = activePane === 'current'
          ? { ...tasks, current: newList }
          : { ...tasks, shelf: newList };
        await persist(newState);
      }
      setEditingIndex(null);
      setEditValue('');
    }
  };

  const handleCreateSubmit = async (continueAdding: boolean = false) => {
    if (editValue.trim()) {
      const newTask: Task = { text: editValue.trim(), notes: [] };
      // Check capacity for current pane
      if (activePane === 'current' && tasks.current.length >= MAX_CURRENT) {
        // Add to shelf instead
        const newState = { ...tasks, shelf: [...tasks.shelf, newTask] };
        await persist(newState);
      } else {
        const insertIndex = currentList.length;
        const newList = [...currentList, newTask];
        const newState = activePane === 'current'
          ? { ...tasks, current: newList }
          : { ...tasks, shelf: newList };
        await persist(newState);
        setSelectedIndex(insertIndex);
      }
    }
    
    if (continueAdding && editValue.trim()) {
      // Clear the input but stay in creating mode
      setEditValue('');
    } else if (!continueAdding || !editValue.trim()) {
      setIsCreating(false);
      setEditValue('');
    }
  };

  const handleNoteEditSubmit = async () => {
    if (editingNoteIndex !== null && expandedIndex !== null) {
      if (editValue.trim()) {
        const newList = [...currentList];
        const newNotes = [...newList[expandedIndex].notes];
        newNotes[editingNoteIndex] = { ...newNotes[editingNoteIndex], text: editValue.trim() };
        newList[expandedIndex] = { ...newList[expandedIndex], notes: newNotes };
        const newState = activePane === 'current'
          ? { ...tasks, current: newList }
          : { ...tasks, shelf: newList };
        await persist(newState);
      }
      setEditingNoteIndex(null);
      setEditValue('');
    }
  };

  const handleNoteCreateSubmit = async (continueAdding: boolean = false) => {
    if (editValue.trim() && expandedIndex !== null) {
      const newList = [...currentList];
      const newNote: Note = { text: editValue.trim(), completed: false };
      const newNotes = [...newList[expandedIndex].notes, newNote];
      newList[expandedIndex] = { ...newList[expandedIndex], notes: newNotes };
      const newState = activePane === 'current'
        ? { ...tasks, current: newList }
        : { ...tasks, shelf: newList };
      await persist(newState);
      // Select the newly added note
      setSelectedNoteIndex(newNotes.length - 1);
    }
    
    if (continueAdding) {
      // Clear the input but stay in creating mode
      setEditValue('');
    } else {
      setIsCreatingNote(false);
      setEditValue('');
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editingIndex !== null) {
        handleEditSubmit();
      } else if (isCreating) {
        // Enter saves and opens new input for next task
        handleCreateSubmit(true);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingIndex(null);
      setIsCreating(false);
      setEditValue('');
    }
  };

  const handleNoteInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editingNoteIndex !== null) {
        handleNoteEditSubmit();
      } else if (isCreatingNote) {
        // Enter adds current note and opens new input for another note
        handleNoteCreateSubmit(true);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingNoteIndex(null);
      setIsCreatingNote(false);
      setEditValue('');
    }
  };

  const renderPane = (pane: Pane, items: Task[]) => {
    const isActive = activePane === pane;
    const shouldShake = shakePane && pane === 'current' && activePane === 'shelf';
    const isCurrent = pane === 'current';
    
    return (
      <div className={`pane ${isActive ? 'active' : ''} ${shouldShake ? 'shake' : ''}`}>
        <div className={`pane-header ${isCurrent ? 'current' : 'shelf'}`}>
          {pane.toUpperCase()}
        </div>
        <div className="pane-content">
          {items.length === 0 && !isCreating && (
            <div className="empty-state">No tasks</div>
          )}
          {items.map((task, idx) => {
            const isSelected = isActive && selectedIndex === idx;
            const isEditing = isActive && editingIndex === idx;
            const isFlashing = isActive && flashIndex === idx;
            const isExpanded = isActive && expandedIndex === idx;
            
            return (
              <div key={idx} className="task-container">
                <div 
                  className={`task ${isSelected ? 'selected' : ''} ${isFlashing ? 'flash' : ''}`}
                >
                  <span className="cursor">{isSelected ? '›' : ' '}</span>
                  {isCurrent ? (
                    <span className="task-number">{idx + 1}.</span>
                  ) : (
                    <span className="task-bullet">•</span>
                  )}
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      onBlur={handleEditSubmit}
                      className="task-input"
                      autoFocus
                    />
                  ) : (
                    <span className="task-text">
                      {renderTextWithLinks(task.text)}
                      {task.notes.length > 0 && (
                        <span className="note-indicator"> ({task.notes.length})</span>
                      )}
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <div className="notes-container">
                    {task.notes.length === 0 && !isCreatingNote && (
                      <div className="empty-notes">No items - press 'o' to add</div>
                    )}
                    {task.notes.map((note, noteIdx) => {
                      const isNoteSelected = selectedNoteIndex === noteIdx;
                      const isNoteEditing = editingNoteIndex === noteIdx;
                      const isNoteCompleted = note.completed;
                      
                      return (
                        <div 
                          key={noteIdx} 
                          className={`note ${isNoteSelected ? 'selected' : ''} ${isNoteCompleted ? 'completed' : ''}`}
                          onClick={() => {
                            setSelectedNoteIndex(noteIdx);
                          }}
                        >
                          <span className="note-radio">{isNoteCompleted ? '✓' : (isNoteSelected ? '◉' : '○')}</span>
                          {isNoteEditing ? (
                            <input
                              ref={noteInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleNoteInputKeyDown}
                              onBlur={handleNoteEditSubmit}
                              className="note-input"
                              autoFocus
                            />
                          ) : (
                            <span className="note-text">{renderTextWithLinks(note.text)}</span>
                          )}
                        </div>
                      );
                    })}
                    {isCreatingNote && (
                      <div className="note creating selected">
                        <span className="note-radio">○</span>
                        <input
                          ref={noteInputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleNoteInputKeyDown}
                          onBlur={() => handleNoteCreateSubmit(false)}
                          className="note-input"
                          placeholder="New item..."
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {isCreating && isActive && (
            <div className="task-container">
              <div className="task selected creating">
                <span className="cursor">›</span>
                {isCurrent ? (
                  <span className="task-number">{items.length + 1}.</span>
                ) : (
                  <span className="task-bullet">•</span>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onBlur={() => handleCreateSubmit(false)}
                  className="task-input"
                  placeholder="New task..."
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      {renderPane(activePane, currentList)}
      {saveIndicator && <div className="save-indicator">saved</div>}
      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-content" onClick={(e) => e.stopPropagation()}>
            <div className="help-title">Keyboard Shortcuts</div>
            <div className="help-section">
              <div className="help-category">Navigation</div>
              <div className="help-row"><span className="help-key">j / k</span><span>Move down / up</span></div>
              <div className="help-row"><span className="help-key">Tab</span><span>Switch pane</span></div>
              <div className="help-row"><span className="help-key">Enter</span><span>Expand task notes</span></div>
            </div>
            <div className="help-section">
              <div className="help-category">Tasks</div>
              <div className="help-row"><span className="help-key">o</span><span>New task / note</span></div>
              <div className="help-row"><span className="help-key">a</span><span>Edit selected</span></div>
              <div className="help-row"><span className="help-key">m</span><span>Move to other pane</span></div>
              <div className="help-row"><span className="help-key">J / K</span><span>Reorder task</span></div>
            </div>
            <div className="help-section">
              <div className="help-category">Actions</div>
              <div className="help-row"><span className="help-key">⌘↵</span><span>Complete task / toggle note</span></div>
              <div className="help-row"><span className="help-key">⌘⌫</span><span>Delete</span></div>
              <div className="help-row"><span className="help-key">u</span><span>Undo</span></div>
              <div className="help-row"><span className="help-key">Esc</span><span>Close / Hide</span></div>
            </div>
            <div className="help-footer">Press ? or Esc to close</div>
          </div>
        </div>
      )}
      {showSettings && (
        <div className="help-overlay" onClick={() => { setShowSettings(false); setPendingHotkey(null); setHotkeyError(null); }}>
          <div className="help-content settings-content" onClick={(e) => e.stopPropagation()}>
            <div className="help-title">Settings</div>
            <div className="help-section">
              <div className="help-category">Global Hotkey</div>
              <div className="hotkey-display">
                <span className="hotkey-label">Current:</span>
                <span className="hotkey-value">{currentHotkey}</span>
              </div>
              <div className="hotkey-capture">
                <span className="hotkey-label">New:</span>
                <span className={`hotkey-input ${pendingHotkey ? 'has-value' : ''}`}>
                  {pendingHotkey || 'Press keys...'}
                </span>
              </div>
              {hotkeyError && (
                <div className="hotkey-error">{hotkeyError}</div>
              )}
              <div className="hotkey-actions">
                <button
                  className="hotkey-button save"
                  onClick={saveHotkey}
                  disabled={!pendingHotkey}
                >
                  Save
                </button>
                <button
                  className="hotkey-button cancel"
                  onClick={() => { setShowSettings(false); setPendingHotkey(null); setHotkeyError(null); }}
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="help-footer">Press Esc to cancel</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
