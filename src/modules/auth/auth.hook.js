export function authenticateUser(request, reply, done) {
  if (!request.session.user) {
    reply.code(401);
    done(new Error('Authentication required. Please sign in to continue.'));
    return;
  }

  // Decorate request
  request.userId = request.session.user.id;

  done();
}
