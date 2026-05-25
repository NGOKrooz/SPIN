# POST_ACCEPT_CORRUPTION_TRACE
Date: 2026-05-25T17:42:16.033Z

Initial state:

=== initial ===
internId=6a1489f98d63d84f886e87f4
{
  "total": 3,
  "active": [
    {
      "id": "6a1489f98d63d84f886e87f6",
      "unit": "Cardiology",
      "startDate": "2026-04-29T23:00:00.000Z",
      "endDate": "2026-05-18T23:00:00.000Z",
      "status": "active",
      "actualEndDate": null
    }
  ],
  "awaiting": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": "Neurology",
      "startDate": "2026-05-19T23:00:00.000Z",
      "endDate": "2026-06-07T23:00:00.000Z",
      "status": "awaiting_confirmation"
    }
  ],
  "upcoming": [
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": "Pediatrics",
      "startDate": "2026-06-08T23:00:00.000Z",
      "endDate": "2026-06-27T23:00:00.000Z",
      "status": "upcoming"
    }
  ],
  "completed": []
}

Before acceptMovement:

=== before acceptMovement (DB) ===
internId=6a1489f98d63d84f886e87f4
{
  "total": 3,
  "active": [
    {
      "id": "6a1489f98d63d84f886e87f6",
      "unit": "Cardiology",
      "startDate": "2026-04-29T23:00:00.000Z",
      "endDate": "2026-05-18T23:00:00.000Z",
      "status": "active",
      "actualEndDate": null
    }
  ],
  "awaiting": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": "Neurology",
      "startDate": "2026-05-19T23:00:00.000Z",
      "endDate": "2026-06-07T23:00:00.000Z",
      "status": "awaiting_confirmation"
    }
  ],
  "upcoming": [
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": "Pediatrics",
      "startDate": "2026-06-08T23:00:00.000Z",
      "endDate": "2026-06-27T23:00:00.000Z",
      "status": "upcoming"
    }
  ],
  "completed": []
}
GET /api/interns => 200

=== after GET /api/interns pre-accept ===
internId=6a1489f98d63d84f886e87f4
{
  "total": 3,
  "active": [
    {
      "id": "6a1489f98d63d84f886e87f6",
      "unit": "Cardiology",
      "startDate": "2026-04-29T23:00:00.000Z",
      "endDate": "2026-05-24T23:00:00.000Z",
      "status": "active",
      "actualEndDate": null
    }
  ],
  "awaiting": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": "Neurology",
      "startDate": "2026-05-25T23:00:00.000Z",
      "endDate": "2026-06-13T23:00:00.000Z",
      "status": "awaiting_confirmation"
    }
  ],
  "upcoming": [
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": "Pediatrics",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "status": "upcoming"
    }
  ],
  "completed": []
}

Reassign next unit to Orthopedics (6a1489f98d63d84f886e87f1)
reassign-next status=200
{
  "success": true,
  "message": "Next unit reassigned for Trace Intern",
  "data": {
    "internName": "Trace Intern",
    "previousUnit": "Neurology",
    "newUnit": "Orthopedics",
    "updatedRotation": {
      "_id": "6a1489f98d63d84f886e87f8",
      "intern": "6a1489f98d63d84f886e87f4",
      "unit": "6a1489f98d63d84f886e87f1",
      "startDate": "2026-05-25T23:00:00.000Z",
      "baseDuration": 20,
      "manualExtensionDays": 0,
      "autoExtensionDays": 0,
      "extensionDays": 0,
      "duration": 20,
      "endDate": "2026-06-13T23:00:00.000Z",
      "workflowState": null,
      "status": "awaiting_confirmation",
      "createdAt": "2026-05-25T17:42:17.393Z",
      "__v": 0
    }
  }
}

=== after reassign-next ===
internId=6a1489f98d63d84f886e87f4
{
  "total": 3,
  "active": [
    {
      "id": "6a1489f98d63d84f886e87f6",
      "unit": "Cardiology",
      "startDate": "2026-04-29T23:00:00.000Z",
      "endDate": "2026-05-24T23:00:00.000Z",
      "status": "active",
      "actualEndDate": null
    }
  ],
  "awaiting": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": "Orthopedics",
      "startDate": "2026-05-25T23:00:00.000Z",
      "endDate": "2026-06-13T23:00:00.000Z",
      "status": "awaiting_confirmation"
    }
  ],
  "upcoming": [
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": "Pediatrics",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "status": "upcoming"
    }
  ],
  "completed": []
}

Calling acceptMovement
accept-movement status=200
{
  "success": true,
  "message": "Movement accepted for Trace Intern",
  "data": {
    "internName": "Trace Intern",
    "fromUnit": "Cardiology",
    "toUnit": "Orthopedics",
    "updatedRotation": {
      "_id": "6a1489f98d63d84f886e87f8",
      "intern": "6a1489f98d63d84f886e87f4",
      "unit": {
        "_id": "6a1489f98d63d84f886e87f1",
        "name": "Orthopedics",
        "order": 4,
        "durationDays": 20,
        "capacity": 5,
        "patientCount": 0,
        "description": null,
        "position": 4,
        "createdAt": "2026-05-25T17:42:17.354Z",
        "updatedAt": "2026-05-25T17:42:17.354Z",
        "__v": 0,
        "duration": 20,
        "id": "6a1489f98d63d84f886e87f1"
      },
      "startDate": "2026-05-24T23:00:00.000Z",
      "baseDuration": 20,
      "manualExtensionDays": 0,
      "autoExtensionDays": 0,
      "extensionDays": 0,
      "duration": 20,
      "endDate": "2026-06-12T23:00:00.000Z",
      "workflowState": null,
      "status": "active",
      "createdAt": "2026-05-25T17:42:17.393Z",
      "__v": 0
    }
  }
}

=== after acceptMovement ===
internId=6a1489f98d63d84f886e87f4
{
  "total": 3,
  "active": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": "Orthopedics",
      "startDate": "2026-05-24T23:00:00.000Z",
      "endDate": "2026-06-12T23:00:00.000Z",
      "status": "active",
      "actualEndDate": null
    }
  ],
  "awaiting": [],
  "upcoming": [
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": "Pediatrics",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "status": "upcoming"
    }
  ],
  "completed": [
    {
      "id": "6a1489f98d63d84f886e87f6",
      "unit": "Cardiology",
      "startDate": "2026-04-29T23:00:00.000Z",
      "endDate": "2026-05-24T23:00:00.000Z",
      "status": "completed",
      "actualEndDate": "2026-05-24T23:00:00.000Z"
    }
  ]
}

Calling reshuffleAllUpcoming() directly
reshuffleAllUpcoming result: {
  "rebuiltInternCount": 1,
  "results": [
    {
      "internId": "6a1489f98d63d84f886e87f4",
      "upcomingCount": 2,
      "createdUpcomingCount": 0
    }
  ]
}

=== after reshuffleAllUpcoming ===
internId=6a1489f98d63d84f886e87f4
{
  "total": 3,
  "active": [
    {
      "id": "6a1489f98d63d84f886e87f6",
      "unit": "Cardiology",
      "startDate": "2026-04-29T23:00:00.000Z",
      "endDate": "2026-05-24T23:00:00.000Z",
      "status": "active",
      "actualEndDate": "2026-05-24T23:00:00.000Z"
    }
  ],
  "awaiting": [],
  "upcoming": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": "Neurology",
      "startDate": "2026-05-25T23:00:00.000Z",
      "endDate": "2026-06-13T23:00:00.000Z",
      "status": "upcoming"
    },
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": "Pediatrics",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "status": "upcoming"
    }
  ],
  "completed": []
}

Calling GET /api/interns again (queue refresh / sync)
GET /api/interns => 200

=== after GET /api/interns post-reshuffle ===
internId=6a1489f98d63d84f886e87f4
{
  "total": 3,
  "active": [
    {
      "id": "6a1489f98d63d84f886e87f6",
      "unit": "Cardiology",
      "startDate": "2026-04-29T23:00:00.000Z",
      "endDate": "2026-05-24T23:00:00.000Z",
      "status": "active",
      "actualEndDate": "2026-05-24T23:00:00.000Z"
    }
  ],
  "awaiting": [],
  "upcoming": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": "Neurology",
      "startDate": "2026-05-25T23:00:00.000Z",
      "endDate": "2026-06-13T23:00:00.000Z",
      "status": "upcoming"
    },
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": "Pediatrics",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "status": "upcoming"
    }
  ],
  "completed": []
}

Calling GET /api/interns/:id schedule (queue details)
GET /api/interns/:id/schedule => 200
{
  "rotations": [
    {
      "id": "6a1489f98d63d84f886e87f6",
      "startDate": "2026-04-29T23:00:00.000Z",
      "endDate": "2026-05-24T23:00:00.000Z",
      "start_date": "2026-04-29T23:00:00.000Z",
      "end_date": "2026-05-24T23:00:00.000Z",
      "duration": 26,
      "baseDuration": 20,
      "extensionDays": 6,
      "status": "active",
      "workflowState": "pending_confirmation",
      "unitId": "6a1489f98d63d84f886e87ee",
      "unit_id": "6a1489f98d63d84f886e87ee",
      "unitName": "Cardiology",
      "unit_name": "Cardiology",
      "isManualAssignment": false,
      "is_manual_assignment": false,
      "unit": {
        "id": "6a1489f98d63d84f886e87ee",
        "name": "Cardiology",
        "durationDays": 20,
        "duration_days": 20,
        "duration": 20,
        "position": 1,
        "position_order": 1
      }
    },
    {
      "id": "6a1489f98d63d84f886e87f8",
      "startDate": "2026-05-25T23:00:00.000Z",
      "endDate": "2026-06-13T23:00:00.000Z",
      "start_date": "2026-05-25T23:00:00.000Z",
      "end_date": "2026-06-13T23:00:00.000Z",
      "duration": 20,
      "baseDuration": 20,
      "extensionDays": 0,
      "status": "upcoming",
      "workflowState": null,
      "unitId": "6a1489f98d63d84f886e87ef",
      "unit_id": "6a1489f98d63d84f886e87ef",
      "unitName": "Neurology",
      "unit_name": "Neurology",
      "isManualAssignment": false,
      "is_manual_assignment": false,
      "unit": {
        "id": "6a1489f98d63d84f886e87ef",
        "name": "Neurology",
        "durationDays": 20,
        "duration_days": 20,
        "duration": 20,
        "position": 2,
        "position_order": 2
      }
    },
    {
      "id": "6a1489f98d63d84f886e87fa",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "start_date": "2026-06-14T23:00:00.000Z",
      "end_date": "2026-07-03T23:00:00.000Z",
      "duration": 20,
      "baseDuration": 20,
      "extensionDays": 0,
      "status": "upcoming",
      "workflowState": null,
      "unitId": "6a1489f98d63d84f886e87f0",
      "unit_id": "6a1489f98d63d84f886e87f0",
      "unitName": "Pediatrics",
      "unit_name": "Pediatrics",
      "isManualAssignment": false,
      "is_manual_assignment": false,
      "unit": {
        "id": "6a1489f98d63d84f886e87f0",
        "name": "Pediatrics",
        "durationDays": 20,
        "duration_days": 20,
        "duration": 20,
        "position": 3,
        "position_order": 3
      }
    }
  ],
  "current": {
    "id": "6a1489f98d63d84f886e87f6",
    "unit": {
      "_id": "6a1489f98d63d84f886e87ee",
      "name": "Cardiology",
      "order": 1,
      "durationDays": 20,
      "capacity": 5,
      "patientCount": 0,
      "description": null,
      "position": 1,
      "createdAt": "2026-05-25T17:42:17.351Z",
      "updatedAt": "2026-05-25T17:42:17.351Z",
      "__v": 0,
      "duration": 20,
      "id": "6a1489f98d63d84f886e87ee"
    },
    "unit_name": "Cardiology",
    "unit_id": "6a1489f98d63d84f886e87ee",
    "startDate": "2026-04-29T23:00:00.000Z",
    "endDate": "2026-05-24T23:00:00.000Z",
    "start_date": "2026-04-29T23:00:00.000Z",
    "end_date": "2026-05-24T23:00:00.000Z",
    "duration": 26,
    "duration_days": 26,
    "status": "active"
  },
  "upcoming": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": {
        "_id": "6a1489f98d63d84f886e87ef",
        "name": "Neurology",
        "order": 2,
        "durationDays": 20,
        "capacity": 5,
        "patientCount": 0,
        "description": null,
        "position": 2,
        "createdAt": "2026-05-25T17:42:17.353Z",
        "updatedAt": "2026-05-25T17:42:17.353Z",
        "__v": 0,
        "duration": 20,
        "id": "6a1489f98d63d84f886e87ef"
      },
      "unit_name": "Neurology",
      "unit_id": "6a1489f98d63d84f886e87ef",
      "startDate": "2026-05-25T23:00:00.000Z",
      "endDate": "2026-06-13T23:00:00.000Z",
      "start_date": "2026-05-25T23:00:00.000Z",
      "end_date": "2026-06-13T23:00:00.000Z",
      "duration": 20,
      "duration_days": 20,
      "status": "upcoming"
    },
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": {
        "_id": "6a1489f98d63d84f886e87f0",
        "name": "Pediatrics",
        "order": 3,
        "durationDays": 20,
        "capacity": 5,
        "patientCount": 0,
        "description": null,
        "position": 3,
        "createdAt": "2026-05-25T17:42:17.354Z",
        "updatedAt": "2026-05-25T17:42:17.354Z",
        "__v": 0,
        "duration": 20,
        "id": "6a1489f98d63d84f886e87f0"
      },
      "unit_name": "Pediatrics",
      "unit_id": "6a1489f98d63d84f886e87f0",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "start_date": "2026-06-14T23:00:00.000Z",
      "end_date": "2026-07-03T23:00:00.000Z",
      "duration": 20,
      "duration_days": 20,
      "status": "upcoming"
    }
  ],
  "completed": [],
  "currentUnit": "Cardiology",
  "currentStart": "2026-04-29T23:00:00.000Z",
  "currentEnd": "2026-05-24T23:00:00.000Z",
  "progress": "26/26",
  "upcomingRotations": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": {
        "_id": "6a1489f98d63d84f886e87ef",
        "name": "Neurology",
        "order": 2,
        "durationDays": 20,
        "capacity": 5,
        "patientCount": 0,
        "description": null,
        "position": 2,
        "createdAt": "2026-05-25T17:42:17.353Z",
        "updatedAt": "2026-05-25T17:42:17.353Z",
        "__v": 0,
        "duration": 20,
        "id": "6a1489f98d63d84f886e87ef"
      },
      "unit_name": "Neurology",
      "unit_id": "6a1489f98d63d84f886e87ef",
      "startDate": "2026-05-25T23:00:00.000Z",
      "endDate": "2026-06-13T23:00:00.000Z",
      "start_date": "2026-05-25T23:00:00.000Z",
      "end_date": "2026-06-13T23:00:00.000Z",
      "duration": 20,
      "duration_days": 20,
      "status": "upcoming"
    },
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": {
        "_id": "6a1489f98d63d84f886e87f0",
        "name": "Pediatrics",
        "order": 3,
        "durationDays": 20,
        "capacity": 5,
        "patientCount": 0,
        "description": null,
        "position": 3,
        "createdAt": "2026-05-25T17:42:17.354Z",
        "updatedAt": "2026-05-25T17:42:17.354Z",
        "__v": 0,
        "duration": 20,
        "id": "6a1489f98d63d84f886e87f0"
      },
      "unit_name": "Pediatrics",
      "unit_id": "6a1489f98d63d84f886e87f0",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "start_date": "2026-06-14T23:00:00.000Z",
      "end_date": "2026-07-03T23:00:00.000Z",
      "duration": 20,
      "duration_days": 20,
      "status": "upcoming"
    }
  ],
  "remaining": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": {
        "_id": "6a1489f98d63d84f886e87ef",
        "name": "Neurology",
        "order": 2,
        "durationDays": 20,
        "capacity": 5,
        "patientCount": 0,
        "description": null,
        "position": 2,
        "createdAt": "2026-05-25T17:42:17.353Z",
        "updatedAt": "2026-05-25T17:42:17.353Z",
        "__v": 0,
        "duration": 20,
        "id": "6a1489f98d63d84f886e87ef"
      },
      "unit_name": "Neurology",
      "unit_id": "6a1489f98d63d84f886e87ef",
      "startDate": "2026-05-25T23:00:00.000Z",
      "endDate": "2026-06-13T23:00:00.000Z",
      "start_date": "2026-05-25T23:00:00.000Z",
      "end_date": "2026-06-13T23:00:00.000Z",
      "duration": 20,
      "duration_days": 20,
      "status": "upcoming"
    },
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": {
        "_id": "6a1489f98d63d84f886e87f0",
        "name": "Pediatrics",
        "order": 3,
        "durationDays": 20,
        "capacity": 5,
        "patientCount": 0,
        "description": null,
        "position": 3,
        "createdAt": "2026-05-25T17:42:17.354Z",
        "updatedAt": "2026-05-25T17:42:17.354Z",
        "__v": 0,
        "duration": 20,
        "id": "6a1489f98d63d84f886e87f0"
      },
      "unit_name": "Pediatrics",
      "unit_id": "6a1489f98d63d84f886e87f0",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "start_date": "2026-06-14T23:00:00.000Z",
      "end_date": "2026-07-03T23:00:00.000Z",
      "duration": 20,
      "duration_days": 20,
      "status": "upcoming"
    }
  ],
  "remainingCount": 2,
  "totalExtensionDays": 6,
  "eligibleUnits": [
    {
      "id": "6a1489f98d63d84f886e87ef",
      "name": "Neurology",
      "durationDays": 20,
      "duration_days": 20
    },
    {
      "id": "6a1489f98d63d84f886e87f0",
      "name": "Pediatrics",
      "durationDays": 20,
      "duration_days": 20
    },
    {
      "id": "6a1489f98d63d84f886e87f1",
      "name": "Orthopedics",
      "durationDays": 20,
      "duration_days": 20
    },
    {
      "id": "6a1489f98d63d84f886e87f2",
      "name": "Dermatology",
      "durationDays": 20,
      "duration_days": 20
    }
  ]
}

=== after schedule fetch ===
internId=6a1489f98d63d84f886e87f4
{
  "total": 3,
  "active": [
    {
      "id": "6a1489f98d63d84f886e87f6",
      "unit": "Cardiology",
      "startDate": "2026-04-29T23:00:00.000Z",
      "endDate": "2026-05-24T23:00:00.000Z",
      "status": "active",
      "actualEndDate": "2026-05-24T23:00:00.000Z"
    }
  ],
  "awaiting": [],
  "upcoming": [
    {
      "id": "6a1489f98d63d84f886e87f8",
      "unit": "Neurology",
      "startDate": "2026-05-25T23:00:00.000Z",
      "endDate": "2026-06-13T23:00:00.000Z",
      "status": "upcoming"
    },
    {
      "id": "6a1489f98d63d84f886e87fa",
      "unit": "Pediatrics",
      "startDate": "2026-06-14T23:00:00.000Z",
      "endDate": "2026-07-03T23:00:00.000Z",
      "status": "upcoming"
    }
  ],
  "completed": []
}
## Analysis Summary
• acceptMovement() itself is clean: active becomes Orthopedics, completed Cardiology, upcoming Pediatrics.
• Corruption occurs immediately in rotationPlanService.reshuffleAllUpcoming(), not in acceptMovement.
• Inside rebuildInternFutureRotations() (server/services/rotationPlanService.js lines 361-398):
  - getDerivedRotationStatus() at line 81 reclassifies the completed Cardiology rotation as active.
  - This causes line 393 to set activeRotation to the stale completed rotation.
  - The real accepted Orthopedics rotation is then treated as an existing upcoming rotation.
  - existingUpcomingRotations is reused and rewritten, producing two upcoming rotations: Neurology + Pediatrics, and leaving completed empty.
• Exact destructive mutation point: line 386-388 sets rotation.status = derivedStatus and line 393 assigns activeRotation.
• Root cause: rebuilt status logic ignores acceptMovement.actualEndDate and relies only on planned endDate.
• Safe minimal fix: preserve explicit completed rotations after acceptMovement or use actualEndDate when deriving status.
• No deleteMany() or bulk rewrite is involved in this corruption chain; it is caused by unsafe status reclassification.
