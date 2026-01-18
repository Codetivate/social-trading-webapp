import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getGMTOffset(): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, "0");
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, "0");
  return `GMT${sign}${hours}:${minutes}`;
}

export function calculateDaysActive(dateString: string | undefined | null): number {
  if (!dateString) return 0;

  // Try parsing the date
  const startDate = new Date(dateString);
  // Check if date is valid
  if (isNaN(startDate.getTime())) return 0;

  const now = new Date();

  // Calculate difference in milliseconds
  const diffTime = Math.abs(now.getTime() - startDate.getTime());
  // Convert to days
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}
