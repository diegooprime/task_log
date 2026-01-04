import { invoke } from '@tauri-apps/api/core';

export interface Note {
  text: string;
  completed: boolean;
}

export interface Task {
  text: string;
  notes: Note[];
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
  // Pass full task object so notes can be logged
  await invoke('complete_task', { task });
}

export async function hideWindow(): Promise<void> {
  await invoke('hide_window');
}

export async function archiveDone(): Promise<string> {
  return await invoke<string>('archive_done');
}

export async function getHotkey(): Promise<string> {
  return await invoke<string>('get_hotkey');
}

export async function setHotkey(hotkey: string): Promise<void> {
  await invoke('set_hotkey', { hotkey });
}
