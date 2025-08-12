# Kage WebSocket API Documentation

This document defines the WebSocket API interface provided by the Kage, used for external programs to interact with Kage and the Live2D model.

## 1. Connection Information

- **WebSocket URL**: `ws://localhost:PORT` (The specific port needs to be determined in the application configuration, e.g., `ws://localhost:23333`)
- **Communication Format**: JSON

## 2. Communication Protocol

### 2.1 Request Format (Client -> Server)

All requests sent by the client should follow this JSON structure:

```json
{
  "action": "API_ACTION_NAME",
  "params": {
    // API-specific parameter object
  },
  "requestId": "uuid_or_unique_string" // Optional, used to associate requests and responses
}
```

### 2.2 Response Format (Server -> Client)

The server's response to each request follows this JSON structure:

```json
{
  "action": "API_ACTION_NAME",
  "requestId": "uuid_or_unique_string", // Corresponds to the requestId in the request
  "success": true, // or false
  "data": {
    // Data returned on success
  },
  "error": {
    // Error information returned on failure
    "code": "ERROR_CODE",
    "message": "Detailed error description"
  }
}
```

## 3. API List

### 3.1 Model Control

#### 3.1.1 Change Model Path (setModelPath)

Loads or switches the Live2D model.

- **Action**: `setModelPath`
- **Params**:
  ```json
  {
    "path": "C:/path/to/your_model/model_name.model3.json"
  }
  ```
- **Response (Success)**:
  ```json
  {
    "success": true
  }
  ```
- **Response (Error)**: Returns an error message if the model fails to load.

#### 3.1.2 Get Motion List (getMotions)

Gets a list of all supported motion names for the currently loaded model.

- **Action**: `getMotions`
- **Params**: `{}`
- **Response (Success)**:
  ```json
  {
    "success": true,
    "data": {
      "motions": ["Idle", "TapBody", "Shake", "Login", "..."]
    }
  }
  ```

#### 3.1.3 Trigger Motion (triggerMotion)

Triggers the model to perform a specific motion.

- **Action**: `triggerMotion`
- **Params**:
  ```json
  {
    "motionName": "Shake"
  }
  ```
- **Response (Success)**:
  ```json
  {
    "success": true
  }
  ```

#### 3.1.4 Get Expression List (getExpressions)

Gets a list of all supported expression names for the currently loaded model.

- **Action**: `getExpressions`
- **Params**: `{}`
- **Response (Success)**:
  ```json
  {
    "success": true,
    "data": {
      "expressions": ["default", "smile", "angry", "..."]
    }
  }
  ```

#### 3.1.5 Set Expression (setExpression)

Sets the model's current expression.

- **Action**: `setExpression`
- **Params**:
  ```json
  {
    "expressionName": "smile"
  }
  ```
- **Response (Success)**:
  ```json
  {
    "success": true
  }
  ```

#### 3.1.6 Clear Expression (clearExpression)

Restores the model's default expression.

- **Action**: `clearExpression`
- **Params**: `{}`
- **Response (Success)**:
  ```json
  {
    "success": true
  }
  ```

### 3.2 Model Container Control

#### 3.2.1 Set Model Size (setModelSize)

Sets the dimensions of the Live2D model's visible area.

- **Action**: `setModelSize`
- **Params**:
  ```json
  {
    "width": 400,
    "height": 300
  }
  ```
- **Response (Success)**:
  ```json
  {
    "success": true,
    "data": {
        "width": 400,
        "height": 300
    }
  }
  ```

#### 3.2.2 Set Model Position (setModelPosition)

Sets the top-left position coordinates of the Live2D model's visible area on the screen.

- **Action**: `setModelPosition`
- **Params**:
  ```json
  {
    "x": 100, // Screen X-coordinate (top-left)
    "y": 100  // Screen Y-coordinate (top-left)
  }
  ```
- **Response (Success)**:
  ```json
  {
    "success": true,
    "data": {
        "x": 100,
        "y": 100
    }
  }
  ```

### 3.3 Interactive Features

#### 3.3.1 Show Text Message (showTextMessage)

Displays a semi-transparent text bubble with white text on a black background above the model.

- **Action**: `showTextMessage`
- **Params**:
  ```json
  {
    "message": "Hello, World!",
    "duration": 5000 // Display duration (milliseconds), 0 means it stays until replaced by a new message or cleared manually
  }
  ```
- **Response (Success)**:
  ```json
  {
    "success": true
  }
  ```

### 3.4 System Functions

#### 3.4.1 Get Version Information (getVersion)

Gets the current version number of the Kage application.

- **Action**: `getVersion`
- **Params**: `{}`
- **Response (Success)**:
  ```json
  {
    "success": true,
    "data": {
      "version": "1.0.0",
      "electronVersion": "25.0.0",
      "live2dCoreVersion": "..."
    }
  }
  ```

#### 3.4.2 Exit Application (exitApp)

Closes the Kage application.

- **Action**: `exitApp`
- **Params**: `{}`
- **Response (Success)**:
  ```json
  {
    "success": true
  }
  ```
  *Note: The application will exit immediately after sending the success response.*

#### 3.4.3 Restart Application (restartApp)

Restarts the Kage application.

- **Action**: `restartApp`
- **Params**: `{}`
- **Response (Success)**:
  ```json
  {
    "success": true
  }
  ```
  *Note: The application will restart immediately after sending the success response.*