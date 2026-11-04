import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../lib/auth.js';

export function authenticateUser(request, reply, done) {
  auth.api
    .getSession({
      headers: fromNodeHeaders(request.headers),
    })
    .then((session) => {
      if (!session) {
        reply.code(401);
        done(new Error('Authentication required. Please sign in to continue.'));
        return;
      }

      // Decorate request
      request.userId = session.user.id;

      done();
    });
}
