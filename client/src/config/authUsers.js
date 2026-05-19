export const authUsers = [
  {
    email: 'coach@classroom.com',
    password: 'coach123',
    name: 'Coach',
    role: 'coach'
  },
  {
    email: 'student1@classroom.com',
    password: 'student123',
    name: 'Student 1',
    role: 'student'
  },
  {
    email: 'student2@classroom.com',
    password: 'student123',
    name: 'Student 2',
    role: 'student'
  },
  {
    email: 'student3@classroom.com',
    password: 'student123',
    name: 'Student 3',
    role: 'student'
  }
];

export const loginUser = (email, password) => {
  const user = authUsers.find(u => u.email === email && u.password === password);
  if (user) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  return null;
};
