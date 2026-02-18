---
name: exploration
description: Use this skill when users want to understand what documents and information are available in the knowledge base. Triggers on questions like "what do you know about" or "what sources do you have".
---

# Exploration Skill

## Purpose
Help users understand what information is available in the knowledge base.

## Available Tools
- explore(): List available documents and their structure

## Workflow
1. Call explore() to see available documents
2. Present document list with chunk counts
3. Help user identify relevant sources

## Best Practices
- Use when user asks "what do you know about X"
- Use before targeted search to understand the landscape
- Mention document names when citing information
