/**
 * Utility functions for parsing JSON content that may be wrapped in markdown code blocks
 */

import { A } from "vitest/dist/chunks/environment.d.cL3nLXbE";
import { AnyExpertTask } from "./task-type";

/**
 * Extracts and parses JSON from a string that may contain markdown code blocks
 * @param content - The content string that may contain JSON
 * @returns The parsed JSON object or null if parsing fails
 */
export function extractAndParseJSON<T>(content: string): T | null {
	if (!content || typeof content !== "string") {
		return null;
	}

	// Clean the content by removing extra whitespace
	const cleanContent = content.trim();

	// Method 1: Try to parse directly as JSON
	try {
		return JSON.parse(cleanContent) as T;
	} catch (e) {
		// Continue to other methods if direct parsing fails
	}

	// Method 2: Extract JSON from markdown code blocks
	// Look for ```json ... ``` or ``` ... ``` patterns
	const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;
	const matches = jsonBlockRegex.exec(cleanContent);

	if (matches && matches[1]) {
		try {
			return JSON.parse(matches[1].trim()) as T;
		} catch (e) {
			console.warn("Failed to parse JSON from markdown block:", e);
		}
	}

	// Method 3: Look for JSON-like content between curly braces
	const jsonObjectRegex = /\{[\s\S]*\}/;
	const jsonMatch = cleanContent.match(jsonObjectRegex);

	if (jsonMatch) {
		try {
			return JSON.parse(jsonMatch[0]) as T;
		} catch (e) {
			console.warn("Failed to parse JSON from object pattern:", e);
		}
	}

	console.warn("No valid JSON found in content:", content);
	return null;
}

/**
 * Checks if the content contains valid JSON structure
 * @param content - The content to check
 * @returns True if content contains parseable JSON
 */
export function hasValidJSON(content: string): boolean {
	return extractAndParseJSON(content) !== null;
}

/**
 * Safely extracts subtask information from orchestrator response
 * @param content - The orchestrator response content
 * @returns The parsed subtask object or null
 */
export function extractSubtaskFromResponse(content: string): any {
	const parsed = extractAndParseJSON<AnyExpertTask>(content);

	if (!parsed) {
		return null;
	}

	// Check if it's a direct subtask object or wrapped in task_prompt_for_expert_agent
	if (parsed.task_prompt_for_expert_agent) {
		return parsed.task_prompt_for_expert_agent;
	}

	// Check if it has the expected subtask structure
	if (parsed.task_type && parsed.task_prompt_for_expert_agent) {
		return parsed;
	}

	return parsed;
}
