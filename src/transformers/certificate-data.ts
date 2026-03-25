export const mapUsersFieldsToConvexAccount = (users: any[]) => {
  if (!users.length) return [];
  return users.map((user) => {
    return {
      name: user.name,
      type: user.type, // TODO: personal or business??
      slug: generateSlug(), // TODO: fix slug
      ownerId: String(user.id),
      createdAt: new Date(user.created_at).getTime(),
      updatedAt: new Date(user.updated_at).getTime(),
    };
  });
};

const generateSlug = () => {
  return Math.random().toString(36).substring(2, 15);
};
