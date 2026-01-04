import { invoke } from '@tauri-apps/api/core';

export interface Task {
  text: string;
  notes: string[];
}

export interface TaskState {
  current: Task[];
  shelf: Task[];
}

export async function getTasks(): Promise<TaskState> {
  return await invoke<TaskState>('get_tasks');
}

export async function saveTasks(state: TaskState): Promise<void> {
  await invoke('save_state', { newState: state });
}

export async function completeTask(task: Task): Promise<void> {
  await invoke('complete_task', { task: task.text });
}

export async function hideWindow(): Promise<void> {
  await invoke('hide_window');
}
