export const mongodbObjectIdSchema = {
  $id: 'https://wessey.com/schemas/mongodb-id.json',
  type: 'string',
  pattern: '^[a-f0-9]{24}$',
};
