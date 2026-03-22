"""
PromptValidator - Fail-Fast Template Validation for Agent Workflows

Blocks the agent loop when unresolved template variables are detected.
"""

import re


class PromptValidator:
    """
    Validates prompt strings for unresolved template variables.
    
    Implements fail-fast validation that blocks the pipeline when
    unresolved template patterns ({{...}}) are detected.
    """
    
    # Pattern to match {{variable_name}} or {{ any content }}
    TEMPLATE_PATTERN = re.compile(r'\{\{.*?\}\}')
    
    @staticmethod
    def validate_template(input_string: str) -> str:
        """
        Validates that no unresolved template variables exist in the input.
        
        Args:
            input_string: The string to validate
            
        Returns:
            str: The input_string if validation passes
            
        Raises:
            ValueError: If unresolved template variables ({{...}}) are found
        """
        if not isinstance(input_string, str):
            raise TypeError(f"Expected string, got {type(input_string).__name__}")
        
        # Find all unresolved template variables
        unresolved = PromptValidator.TEMPLATE_PATTERN.findall(input_string)
        
        if unresolved:
            # Remove duplicates while preserving order
            seen = set()
            unique_vars = []
            for var in unresolved:
                if var not in seen:
                    seen.add(var)
                    unique_vars.append(var)
            
            # Build error message with all unresolved variables
            var_list = ', '.join(f'"{var}"' for var in unique_vars)
            raise ValueError(
                f"Unresolved template variables detected: {var_list}. "
                f"Ensure all template variables are resolved before passing to LLM."
            )
        
        return input_string


# Convenience function for direct usage
def validate_prompt(input_string: str) -> str:
    """
    Convenience wrapper for PromptValidator.validate_template().
    
    Args:
        input_string: The string to validate
        
    Returns:
        str: The input_string if validation passes
        
    Raises:
        ValueError: If unresolved template variables are found
    """
    return PromptValidator.validate_template(input_string)


if __name__ == "__main__":
    # Test cases
    print("Testing PromptValidator...")
    
    # Test 1: Valid string (no templates)
    try:
        result = PromptValidator.validate_template("This is a clean prompt.")
        print("✅ Test 1 passed: Clean prompt accepted")
    except Exception as e:
        print(f"❌ Test 1 failed: {e}")
    
    # Test 2: Valid string (resolved content)
    try:
        result = PromptValidator.validate_template("Goal: Implement feature X")
        print("✅ Test 2 passed: Resolved content accepted")
    except Exception as e:
        print(f"❌ Test 2 failed: {e}")
    
    # Test 3: Invalid string (unresolved template)
    try:
        result = PromptValidator.validate_template("Goal: {{GOAL_OR_ISSUE}}")
        print("❌ Test 3 failed: Should have raised ValueError")
    except ValueError as e:
        print(f"✅ Test 3 passed: Caught unresolved variable - {e}")
    
    # Test 4: Invalid string (multiple unresolved templates)
    try:
        result = PromptValidator.validate_template(
            "Goal: {{GOAL_OR_ISSUE}}, Context: {{CURRENT_ARCHITECTURE_OR_CODE}}"
        )
        print("❌ Test 4 failed: Should have raised ValueError")
    except ValueError as e:
        print(f"✅ Test 4 passed: Caught multiple variables - {e}")
    
    # Test 5: Empty template
    try:
        result = PromptValidator.validate_template("Empty: {{}}")
        print("❌ Test 5 failed: Should have raised ValueError")
    except ValueError as e:
        print(f"✅ Test 5 passed: Caught empty template - {e}")
    
    print("\nAll tests completed.")
