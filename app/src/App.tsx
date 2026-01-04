import { useEffect, useState, useRef, useCallback } from 'react';
import { getTasks, saveTasks, completeTask, hideWindow, TaskState } from './store';
import './App.css';

type Pane = 'current' | 'shelf';

const MAX_CURRENT = 5;

function App() {
  const [tasks, setTasks] = useState<TaskState>({ current: [], shelf: [] });
  const [activePane, setActivePane] = useState<Pane>('current');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [shakePane, setShakePane] = useState(false);
  const [shelfVisible, setShelfVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const persist = useCallback(async (newState: TaskState) => {
    setTasks(newState);
    await saveTasks(newState);
  }, []);

  const clampIndex = useCallback((idx: number, list: string[]) => {
    if (list.length === 0) return 0;
    return Math.max(0, Math.min(idx, list.length - 1));
  }, []);

  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    // If editing, only handle edit-specific keys
    if (editingIndex !== null || isCreating) {
      if (e.key === 'Escape') {
        setEditingIndex(null);
        setIsCreating(false);
        setEditValue('');
      }
      return; // Let the input handle other keys
    }

    // Navigation and actions
    switch (e.key) {
      case 'j':
        setSelectedIndex(prev => clampIndex(prev + 1, currentList));
        break;
      case 'k':
        setSelectedIndex(prev => clampIndex(prev - 1, currentList));
        break;
      case 'J':
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
        break;
      case 'K':
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
        break;
      case 'Tab':
        e.preventDefault();
        if (!shelfVisible) {
          // Show shelf and switch to it
          setShelfVisible(true);
          setActivePane('shelf');
          setSelectedIndex(clampIndex(selectedIndex, tasks.shelf));
        } else {
          // Toggle between panes
          const newPane: Pane = activePane === 'current' ? 'shelf' : 'current';
          const newList = newPane === 'current' ? tasks.current : tasks.shelf;
          setActivePane(newPane);
          setSelectedIndex(clampIndex(selectedIndex, newList));
        }
        break;
      case 'Enter':
        if (currentList.length > 0) {
          setEditingIndex(selectedIndex);
          setEditValue(currentList[selectedIndex]);
        }
        break;
      case 'o':
        e.preventDefault();
        setIsCreating(true);
        setEditValue('');
        break;
      case 'd':
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
          }, 150);
        }
        break;
      case 'm':
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
        if (activePane === 'shelf') {
          // Switch back to current and hide shelf
          setActivePane('current');
          setShelfVisible(false);
          setSelectedIndex(clampIndex(selectedIndex, tasks.current));
        } else {
          await hideWindow();
        }
        break;
    }
  }, [activePane, currentList, otherList, selectedIndex, tasks, editingIndex, isCreating, persist, clampIndex, shelfVisible]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleEditSubmit = async () => {
    if (editingIndex !== null) {
      if (editValue.trim()) {
        const newList = [...currentList];
        newList[editingIndex] = editValue.trim();
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
      // Check capacity for current pane
      if (activePane === 'current' && tasks.current.length >= MAX_CURRENT) {
        // Add to shelf instead
        const newState = { ...tasks, shelf: [...tasks.shelf, editValue.trim()] };
        await persist(newState);
      } else {
        const insertIndex = selectedIndex + 1;
        const newList = [
          ...currentList.slice(0, insertIndex),
          editValue.trim(),
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

  const renderPane = (pane: Pane, items: string[]) => {
    const isActive = activePane === pane;
    const shouldShake = shakePane && pane === 'current' && activePane === 'shelf';
    
    return (
      <div className={`pane ${isActive ? 'active' : ''} ${shouldShake ? 'shake' : ''}`}>
        <div className="pane-header">{pane.toUpperCase()}</div>
        <div className="pane-content">
          {items.length === 0 && !isCreating && (
            <div className="empty-state">No tasks</div>
          )}
          {items.map((task, idx) => {
            const isSelected = isActive && selectedIndex === idx;
            const isEditing = isActive && editingIndex === idx;
            const isFlashing = isActive && flashIndex === idx;
            
            return (
              <div 
                key={idx} 
                className={`task ${isSelected ? 'selected' : ''} ${isFlashing ? 'flash' : ''}`}
              >
                <span className="cursor">{isSelected ? '›' : ' '}</span>
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
                  <span className="task-text">{task}</span>
                )}
              </div>
            );
          })}
          {isCreating && isActive && (
            <div className="task selected creating">
              <span className="cursor">›</span>
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
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      {renderPane('current', tasks.current)}
      {shelfVisible && renderPane('shelf', tasks.shelf)}
    </div>
  );
}

export default App;
