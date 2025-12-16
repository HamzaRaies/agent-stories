# Python Version Compatibility Fix

## Problem

The application was failing with:
```
TypeError: ForwardRef._evaluate() missing 1 required keyword-only argument: 'recursive_guard'
```

## Root Cause

Python 3.12 changed the signature of `ForwardRef._evaluate()` to require a `recursive_guard` keyword argument. However, LangChain's pydantic v1 compatibility layer (used by langsmith) doesn't account for this change, causing import failures.

## Solution

Downgraded to Python 3.11.9, which:
- Doesn't have the `recursive_guard` requirement
- Is fully compatible with LangChain and LangSmith
- Is stable and well-tested

## Changes Made

1. **runtime.txt**: Changed from `python-3.12.7` to `python-3.11.9`
2. **nixpacks.toml**: Changed from `python312` to `python311`
3. **requirements.txt**: Updated LangChain version constraints for better compatibility

## Why Python 3.11?

- Python 3.11 is the latest stable version that works with LangChain 0.1.0
- Python 3.12 introduced breaking changes in typing that affect pydantic v1 compatibility
- Python 3.11 has excellent performance and stability
- All dependencies are tested and compatible with Python 3.11

## Alternative Solutions (Not Recommended)

1. **Wait for LangChain update**: LangChain may fix this in future versions, but no timeline
2. **Use Python 3.10**: Would work but older than 3.11
3. **Patch pydantic v1**: Complex and not recommended

## Verification

After deployment, verify:
- Application starts without errors
- LangChain imports work
- All features function correctly

