//Create the type definitions for the query and our data

export const typeDefs = `#graphql
type Query {
    users: [User]
    user(_id: String!): User
    houseGroups: [HouseGroup]
    houseGroup(_id: String!): HouseGroup
    chores: [Chore]
    chore(_id: String!): Chore
    choreSchedules: [ChoreSchedule]
  }

  type User {
    _id: String
    name: String
    email: String
    profilePicture: String
  }

  type HouseGroup {
    _id: String
    name: String
    members: [User]
    choreList: [Chore]
    schedule: [ChoreSchedule]
  }

  type Chore {
    _id: String
    name: String
    description: String
    assignedTo: User
    houseGroup: HouseGroup
  }

  type ChoreSchedule {
    _id: String
    chore: Chore
    user: User
    houseGroup: HouseGroup
    date: String
  }

  type Mutation {
    # Create a new user
    createUser(input: CreateUserInput!): User
  
    # Update an existing user
    updateUser(_id: String!, input: UpdateUserInput!): User
  
    # Delete a user
    deleteUser(_id: String!): User
  
    # Create a new house group
    createHouseGroup(input: CreateHouseGroupInput!): HouseGroup
  
    # Update an existing house group
    updateHouseGroup(_id: String!, input: UpdateHouseGroupInput!): HouseGroup
  
    # Delete a house group
    deleteHouseGroup(_id: String!): HouseGroup
  
    # Create a new chore
    createChore(input: CreateChoreInput!): Chore
  
    # Update an existing chore
    updateChore(_id: String!, input: UpdateChoreInput!): Chore
  
    # Delete a chore
    deleteChore(_id: String!): Chore
  
    # Schedule a chore for a user in a house group
    scheduleChore(input: ScheduleChoreInput!): ChoreSchedule
  
    # Delete a scheduled chore
    unscheduleChore(_id: String!): ChoreSchedule
  }
  
  input CreateUserInput {
    name: String
    email: String
    # Add other user-specific fields
  }
  
  input UpdateUserInput {
    name: String
    email: String
    # Add other user-specific fields
  }
  
  input CreateHouseGroupInput {
    name: String
    # Add other group-specific fields
  }
  
  input UpdateHouseGroupInput {
    name: String
    # Add other group-specific fields
  }
  
  input CreateChoreInput {
    name: String
    description: String
    assignedTo: String
    houseGroup: String
    # Add other chore-specific fields
  }
  
  input UpdateChoreInput {
    name: String
    description: String
    assignedTo: String
    houseGroup: String
    # Add other chore-specific fields
  }
  
  input ScheduleChoreInput {
    chore: String
    user: String
    houseGroup: String
    date: String
    # Add other schedule-specific fields
  }
  
  }
`;
