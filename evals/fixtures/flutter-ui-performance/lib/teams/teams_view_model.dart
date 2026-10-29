import 'package:flutter/foundation.dart';

import 'teams_repository.dart';
import 'teams_state.dart';

class TeamsViewModel extends ValueNotifier<TeamsState> {
  TeamsViewModel(this._repository) : super(const TeamsState()) {
    _repository.changes.listen((_) => reload());
  }

  final TeamsRepository _repository;

  /// Runs on open and on every sync change from the repository.
  Future<void> reload() async {
    value = value.copyWith(members: const {}, loading: true);
    final teams = await _repository.teams();
    final members = <String, List<String>>{};
    for (final team in teams) {
      members[team.id] = await _repository.members(team.id);
    }
    value = TeamsState(teams: teams, members: members);
  }

  Future<void> rename(String teamId, String name) async {
    await _repository.rename(teamId, name);
    final teams = [
      for (final team in value.teams)
        team.id == teamId ? Team(id: team.id, name: name) : team,
    ];
    value = value.copyWith(teams: teams);
  }
}
