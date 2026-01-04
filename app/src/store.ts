import { invoke } from '@tauri-apps/api/core';

export interface TaskState {
  current: string[];
  shelf: string[];
}

export async function getTasks(): Promise<TaskState> {
  return await invoke<TaskState>('get_tasks');
}

export async function saveTasks(state: TaskState): Promise<void> {
  await invoke('save_state', { newState: state });
}

export async function completeTask(task: string): Promise<void> {
  await invoke('complete_task', { task });
}

export async function hideWindow(): Promise<void> {
  await invoke('hide_window');
}
