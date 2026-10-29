import 'teams_state.dart';

abstract class TeamsRepository {
  /// Emits after every sync that touched teams or members.
  Stream<void> get changes;

  Future<List<Team>> teams();

  Future<List<String>> members(String teamId);

  Future<void> rename(String teamId, String name);
}
