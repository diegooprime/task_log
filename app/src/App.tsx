import { useEffect, useState, useRef, useCallback } from 'react';
import { getTasks, saveTasks, completeTask, hideWindow, TaskState, Task } from './store';
import './App.css';

type Pane = 'current' | 'shelf';

const MAX_CURRENT = 5;
const MAX_HISTORY = 50;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);

  const currentList = activePane === 'current' ? tasks.current : tasks.shelf;
  const otherList = activePane === 'current' ? tasks.shelf : tasks.current;

  useEffect(() => {
    getTasks().then(setTasks);
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

  const pushHistory = useCallback((state: TaskState) => {
    setHistory(prev => {
      const newHistory = [...prev, state];
      if (newHistory.length > MAX_HISTORY) {
        return newHistory.slice(-MAX_HISTORY);
      }
      return newHistory;
    });
  }, []);

  const persist = useCallback(async (newState: TaskState) => {
    pushHistory(tasks); // Save current state to history before changing
    setTasks(newState);
    await saveTasks(newState);
  }, [tasks, pushHistory]);

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

  const clampNoteIndex = useCallback((idx: number, notes: string[]) => {
    if (notes.length === 0) return 0;
    return Math.max(0, Math.min(idx, notes.length - 1));
  }, []);

  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
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
        if (expandedIndex !== null) {
          setExpandedIndex(null);
          return;
        }
        // Toggle between panes
        const newPane: Pane = activePane === 'current' ? 'shelf' : 'current';
        const newList = newPane === 'current' ? tasks.current : tasks.shelf;
        setActivePane(newPane);
        setSelectedIndex(clampIndex(selectedIndex, newList));
        break;
      case 'a':
        if (expandedIndex !== null) {
          // Edit selected note
          if (currentNotes.length > 0) {
            setEditingNoteIndex(selectedNoteIndex);
            setEditValue(currentNotes[selectedNoteIndex]);
          } else {
            // No notes yet, create one
            setIsCreatingNote(true);
            setEditValue('');
          }
        } else if (currentList.length > 0) {
          setEditingIndex(selectedIndex);
          setEditValue(currentList[selectedIndex].text);
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
          // Cmd+Enter or Ctrl+Enter - complete task (mark as done)
          e.preventDefault();
          if (currentList.length > 0) {
            const taskToComplete = currentList[selectedIndex];
            setFlashIndex(selectedIndex);
            
            setTimeout(async () => {
              await completeTask(taskToComplete);
              const newList = currentList.filter((_, i) => i !== selectedIndex);
              const newState = activePane === 'current'
                ? { ...tasks, current: newList }
                : { ...tasks, shelf: newList };
              await persist(newState);
              setSelectedIndex(clampIndex(selectedIndex, newList));
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
            const newNotes = currentNotes.filter((_, i) => i !== selectedNoteIndex);
            const newList = [...currentList];
            newList[expandedIndex] = { ...newList[expandedIndex], notes: newNotes };
            const newState = activePane === 'current'
              ? { ...tasks, current: newList }
              : { ...tasks, shelf: newList };
            await persist(newState);
            setSelectedNoteIndex(clampNoteIndex(selectedNoteIndex, newNotes));
          } else if (currentList.length > 0) {
            // Delete task
            const newList = currentList.filter((_, i) => i !== selectedIndex);
            const newState = activePane === 'current'
              ? { ...tasks, current: newList }
              : { ...tasks, shelf: newList };
            await persist(newState);
            setSelectedIndex(clampIndex(selectedIndex, newList));
            setExpandedIndex(null);
          }
        }
        break;
      case 'm':
        if (expandedIndex !== null) return;
        if (currentList.length > 0) {
          const task = currentList[selectedIndex];
          
          // If moving from shelf to current, check capacity
          if (activePane === 'shelf' && tasks.current.length >= MAX_CURRENT) {
            setShakePane(true);
            setTimeout(() => setShakePane(false), 300);
            break;
          }
          
          const newCurrentList = currentList.filter((_, i) => i !== selectedIndex);
          const newOtherList = [...otherList, task];
          
          const newState = activePane === 'current'
            ? { current: newCurrentList, shelf: newOtherList }
            : { current: newOtherList, shelf: newCurrentList };
          
          await persist(newState);
          setSelectedIndex(clampIndex(selectedIndex, newCurrentList));
        }
        break;
      case 'Escape':
        if (expandedIndex !== null) {
          setExpandedIndex(null);
        } else {
          await hideWindow();
        }
        break;
    }
  }, [activePane, currentList, otherList, selectedIndex, tasks, editingIndex, isCreating, persist, clampIndex, clampNoteIndex, expandedIndex, selectedNoteIndex, editingNoteIndex, isCreatingNote, undo]);

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

  const handleCreateSubmit = async () => {
    if (editValue.trim()) {
      const newTask: Task = { text: editValue.trim(), notes: [] };
      // Check capacity for current pane
      if (activePane === 'current' && tasks.current.length >= MAX_CURRENT) {
        // Add to shelf instead
        const newState = { ...tasks, shelf: [...tasks.shelf, newTask] };
        await persist(newState);
      } else {
        const insertIndex = selectedIndex + 1;
        const newList = [
          ...currentList.slice(0, insertIndex),
          newTask,
          ...currentList.slice(insertIndex)
        ];
        const newState = activePane === 'current'
          ? { ...tasks, current: newList }
          : { ...tasks, shelf: newList };
        await persist(newState);
        setSelectedIndex(insertIndex);
      }
    }
    setIsCreating(false);
    setEditValue('');
  };

  const handleNoteEditSubmit = async () => {
    if (editingNoteIndex !== null && expandedIndex !== null) {
      if (editValue.trim()) {
        const newList = [...currentList];
        const newNotes = [...newList[expandedIndex].notes];
        newNotes[editingNoteIndex] = editValue.trim();
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
      const newNotes = [...newList[expandedIndex].notes, editValue.trim()];
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
        handleCreateSubmit();
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
                  {isCurrent && <span className="task-number">{idx + 1}.</span>}
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
                      {task.text}
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
                      
                      return (
                        <div 
                          key={noteIdx} 
                          className={`note ${isNoteSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedNoteIndex(noteIdx);
                          }}
                        >
                          <span className="note-radio">{isNoteSelected ? '◉' : '○'}</span>
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
                            <span className="note-text">{note}</span>
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
                {isCurrent && <span className="task-number">{items.length + 1}.</span>}
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onBlur={handleCreateSubmit}
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
    </div>
  );
}

export default App;
